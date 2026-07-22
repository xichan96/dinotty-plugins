use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, oneshot, watch, Semaphore};
use tokio::task::JoinSet;

use super::body::{H2Reader, H2Writer};
use super::request::{self, RequestKind};
use crate::edge::connector::EdgeConnection;
use crate::origin::http1::Counters;
use crate::protocol::headers;
use crate::protocol::model::{RegistrationContext, RegistrationDetails};
use crate::protocol::rpc::{self, ControlSession};
use crate::TunnelError;

pub(crate) const MAX_CONCURRENT_STREAMS: u32 = 128;
pub(crate) const MAX_HEADER_LIST_SIZE: u32 = 64 * 1024;
pub(crate) const INITIAL_STREAM_WINDOW: u32 = 1024 * 1024;
pub(crate) const INITIAL_CONNECTION_WINDOW: u32 = 4 * 1024 * 1024;
pub(crate) const CONTROL_STREAM_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug)]
pub(crate) struct ReadyConnection {
    pub details: RegistrationDetails,
    pub edge: std::net::SocketAddr,
}

pub(crate) struct ServeParams {
    pub edge: EdgeConnection,
    pub context: Arc<RegistrationContext>,
    pub conn_index: u8,
    pub previous_attempts: u32,
    pub counters: Counters,
    pub shutdown: watch::Receiver<Option<Instant>>,
    pub ready: Option<oneshot::Sender<Result<ReadyConnection, String>>>,
}

pub(crate) async fn serve(params: ServeParams) -> Result<(), TunnelError> {
    let edge_addr = params.edge.edge.socket;
    let origin_local_ip = params.edge.origin_local_ip;
    serve_stream(
        params.edge.stream,
        edge_addr,
        origin_local_ip,
        StreamParams {
            context: params.context,
            conn_index: params.conn_index,
            previous_attempts: params.previous_attempts,
            counters: params.counters,
            shutdown: params.shutdown,
            ready: params.ready,
        },
    )
    .await
}

struct StreamParams {
    context: Arc<RegistrationContext>,
    conn_index: u8,
    previous_attempts: u32,
    counters: Counters,
    shutdown: watch::Receiver<Option<Instant>>,
    ready: Option<oneshot::Sender<Result<ReadyConnection, String>>>,
}

async fn serve_stream<T>(
    stream: T,
    edge_addr: std::net::SocketAddr,
    origin_local_ip: Option<std::net::IpAddr>,
    mut params: StreamParams,
) -> Result<(), TunnelError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let options = params
        .context
        .connection_options(origin_local_ip, params.previous_attempts);
    let mut connection = h2::server::Builder::new()
        .max_concurrent_streams(MAX_CONCURRENT_STREAMS)
        .max_header_list_size(MAX_HEADER_LIST_SIZE)
        .initial_window_size(INITIAL_STREAM_WINDOW)
        .initial_connection_window_size(INITIAL_CONNECTION_WINDOW)
        .handshake(stream)
        .await
        .map_err(|error| TunnelError::Http2(format!("server handshake: {error}")))?;
    let per_connection = Arc::new(Semaphore::new(MAX_CONCURRENT_STREAMS as usize));
    let mut handlers = JoinSet::new();
    let mut control: Option<ControlSession> = None;
    let mut control_claimed = false;
    let (registration_tx, mut registration_rx) =
        mpsc::channel::<Result<(RegistrationDetails, ControlSession), TunnelError>>(1);
    let control_deadline = tokio::time::sleep(CONTROL_STREAM_TIMEOUT);
    tokio::pin!(control_deadline);

    loop {
        tokio::select! {
            biased;
            changed = params.shutdown.changed() => {
                let deadline = if changed.is_ok() { *params.shutdown.borrow() } else { Some(Instant::now()) }.unwrap_or_else(Instant::now);
                connection.graceful_shutdown();
                let mut unregister = control.take().map(|session| tokio::spawn(session.shutdown_until(deadline)));
                while (unregister.is_some() || !handlers.is_empty()) && Instant::now() < deadline {
                    tokio::select! {
                        result = async { unregister.as_mut().expect("guarded").await }, if unregister.is_some() => {
                            let _ = result;
                            unregister = None;
                        }
                        _ = handlers.join_next(), if !handlers.is_empty() => {}
                        accepted = connection.accept() => {
                            if let Some(Ok((_request, mut respond))) = accepted {
                                let _ = respond.send_response(headers::error_response(503, false), true);
                            }
                        }
                        _ = tokio::time::sleep_until(tokio::time::Instant::from_std(deadline)) => break,
                    }
                }
                if let Some(unregister) = unregister { unregister.abort(); }
                handlers.abort_all();
                return Ok(());
            }
            _ = &mut control_deadline, if control.is_none() => {
                if let Some(ready) = params.ready.take() { let _ = ready.send(Err("edge did not open a control stream before the deadline".into())); }
                return Err(TunnelError::Register("edge did not open a control stream before the deadline".into()));
            }
            _ = async { if let Some(session) = control.as_mut() { session.closed().await } }, if control.is_some() => {
                return Err(TunnelError::Register("control RPC stream closed".into()));
            }
            registration = registration_rx.recv(), if control_claimed && control.is_none() => {
                let Some(registration) = registration else {
                    return Err(TunnelError::Register("control registration task stopped".into()));
                };
                match registration {
                    Ok((details, session)) => {
                        if let Some(ready) = params.ready.take() {
                            let _ = ready.send(Ok(ReadyConnection { details: details.clone(), edge: edge_addr }));
                        }
                        control = Some(session);
                    }
                    Err(error) => {
                        if let Some(ready) = params.ready.take() { let _ = ready.send(Err(error.to_string())); }
                        return Err(error);
                    }
                }
            }
            accepted = connection.accept() => {
                let Some(accepted) = accepted else { return Err(TunnelError::Http2("edge closed H2 connection".into())); };
                let (request, mut respond) = accepted.map_err(|error| TunnelError::Http2(format!("accept stream: {error}")))?;
                let kind = request::classify(&request);
                if kind == RequestKind::Control {
                    if control_claimed {
                        let _ = respond.send_response(headers::error_response(409, false), true);
                        continue;
                    }
                    control_claimed = true;
                    let response = http::Response::builder().status(200).body(()).expect("static control response");
                    let send = respond.send_response(response, false).map_err(|error| TunnelError::Http2(format!("control response: {error}")))?;
                    let recv = request.into_body();
                    let local_configuration = (params.conn_index == 0).then(|| params.context.local_configuration());
                    let registration_tx = registration_tx.clone();
                    let auth = params.context.auth.clone();
                    let tunnel_id = params.context.tunnel_id;
                    let options = options.clone();
                    let conn_index = params.conn_index;
                    tokio::spawn(async move {
                        let result = rpc::register_connection(
                            H2Reader::new(recv), H2Writer::new(send), &auth,
                            tunnel_id, conn_index, &options, local_configuration,
                        ).await;
                        let _ = registration_tx.send(result).await;
                    });
                    continue;
                }
                if control.is_none() {
                    let _ = respond.send_response(headers::error_response(503, false), true);
                    continue;
                }
                let Ok(connection_permit) = per_connection.clone().try_acquire_owned() else {
                    let _ = respond.send_response(headers::error_response(503, true), true);
                    continue;
                };
                let Some(global_permit) = request::global_permit() else {
                    let _ = respond.send_response(headers::error_response(503, true), true);
                    continue;
                };
                let gateway = params.context.gateway_addr;
                let hostname = params.context.hostname.clone();
                let counters = params.counters.clone();
                counters.streams_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                handlers.spawn(async move {
                    let _permits = (connection_permit, global_permit);
                    if let Err(error) = request::dispatch(gateway, hostname, kind, request, respond, counters).await {
                        tracing::warn!(%error, "H2 request stream failed");
                    }
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use bytes::Bytes;
    use capnp::capability::Promise;
    use capnp_rpc::{rpc_twoparty_capnp, twoparty, RpcSystem};
    use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
    use uuid::Uuid;

    use super::*;
    use crate::protocol::model::TunnelAuth;
    use crate::tunnelrpc_capnp;

    #[derive(Default)]
    struct Captured {
        client_id: Vec<u8>,
        previous_attempts: u8,
        replace_existing: bool,
        features: Vec<String>,
        local_config: Vec<u8>,
        unregistered: bool,
    }

    struct FakeRegistration(Arc<Mutex<Captured>>);

    impl tunnelrpc_capnp::registration_server::Server for FakeRegistration {
        fn register_connection(
            &mut self,
            params: tunnelrpc_capnp::registration_server::RegisterConnectionParams,
            mut results: tunnelrpc_capnp::registration_server::RegisterConnectionResults,
        ) -> Promise<(), capnp::Error> {
            let result = (|| {
                let params = params.get()?;
                let options = params.get_options()?;
                let client = options.get_client()?;
                let mut captured = self.0.lock().expect("capture lock");
                captured.client_id = client.get_client_id()?.to_vec();
                captured.previous_attempts = options.get_num_previous_attempts();
                captured.replace_existing = options.get_replace_existing();
                captured.features = client
                    .get_features()?
                    .iter()
                    .filter_map(|value| value.ok()?.to_string().ok())
                    .collect();
                drop(captured);
                let mut details = results
                    .get()
                    .init_result()
                    .init_result()
                    .init_connection_details();
                details.set_uuid(Uuid::nil().as_bytes());
                details.set_location_name("unit-pop");
                details.set_tunnel_is_remotely_managed(false);
                Ok(())
            })();
            match result {
                Ok(()) => Promise::ok(()),
                Err(error) => Promise::err(error),
            }
        }

        fn unregister_connection(
            &mut self,
            _params: tunnelrpc_capnp::registration_server::UnregisterConnectionParams,
            _results: tunnelrpc_capnp::registration_server::UnregisterConnectionResults,
        ) -> Promise<(), capnp::Error> {
            self.0.lock().expect("capture lock").unregistered = true;
            Promise::ok(())
        }

        fn update_local_configuration(
            &mut self,
            params: tunnelrpc_capnp::registration_server::UpdateLocalConfigurationParams,
            _results: tunnelrpc_capnp::registration_server::UpdateLocalConfigurationResults,
        ) -> Promise<(), capnp::Error> {
            let result = params
                .get()
                .and_then(|params| params.get_config().map(|config| config.to_vec()));
            match result {
                Ok(config) => {
                    self.0.lock().expect("capture lock").local_config = config;
                    Promise::ok(())
                }
                Err(error) => Promise::err(error),
            }
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn fake_edge_runs_real_h2_and_capnp_control_stream() {
        let _ = tracing_subscriber::fmt().with_test_writer().try_init();
        tokio::task::LocalSet::new().run_until(async {
            let (tunnel_io, edge_io) = tokio::io::duplex(16 * 1024);
            let origin = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let gateway_addr = origin.local_addr().unwrap();
            tokio::task::spawn_local(async move {
                for _ in 0..2 {
                    let (mut stream, _) = origin.accept().await.unwrap();
                    tokio::task::spawn_local(async move {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut head = Vec::new();
                        let mut byte = [0u8; 1];
                        while !head.ends_with(b"\r\n\r\n") {
                            stream.read_exact(&mut byte).await.unwrap();
                            head.push(byte[0]);
                        }
                        if String::from_utf8_lossy(&head).contains("Upgrade: websocket") {
                            stream.write_all(b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: unit\r\n\r\n").await.unwrap();
                            let mut payload = [0u8; 4];
                            stream.read_exact(&mut payload).await.unwrap();
                            stream.write_all(&payload).await.unwrap();
                        } else {
                            let mut terminal_chunk = [0u8; 5];
                            stream.read_exact(&mut terminal_chunk).await.unwrap();
                            assert_eq!(&terminal_chunk, b"0\r\n\r\n");
                            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nhello").await.unwrap();
                        }
                    });
                }
            });
            let context = Arc::new(RegistrationContext::new(
                Uuid::nil(),
                TunnelAuth { account_tag: "account".into(), tunnel_secret: vec![7; 32] },
                "unit.trycloudflare.com".into(),
                gateway_addr,
                "test/1",
            ));
            let (shutdown_tx, shutdown_rx) = watch::channel(None);
            let (ready_tx, ready_rx) = oneshot::channel();
            let mut server = tokio::task::spawn_local(serve_stream(
                tunnel_io,
                "127.0.0.1:7844".parse().unwrap(),
                Some("127.0.0.1".parse().unwrap()),
                StreamParams { context: context.clone(), conn_index: 0, previous_attempts: 7, counters: Counters::default(), shutdown: shutdown_rx, ready: Some(ready_tx) },
            ));

            let (mut client, driver) = h2::client::Builder::new().initial_window_size(1024).handshake(edge_io).await.unwrap();
            tokio::task::spawn_local(async move { let _ = driver.await; });
            let request = http::Request::builder()
                .method("POST")
                .uri("https://unit.trycloudflare.com/")
                .header(headers::INTERNAL_UPGRADE, headers::CONTROL_STREAM)
                .body(())
                .unwrap();
            let (response, request_body) = client.send_request(request, false).unwrap();
            let response = tokio::select! {
                response = response => response.unwrap(),
                result = &mut server => panic!("fake tunnel server stopped before response: {result:?}"),
            };
            assert_eq!(response.status(), 200);

            let captured = Arc::new(Mutex::new(Captured::default()));
            let bootstrap: tunnelrpc_capnp::registration_server::Client = capnp_rpc::new_client(FakeRegistration(captured.clone()));
            let network = Box::new(twoparty::VatNetwork::new(
                H2Reader::new(response.into_body()).compat(),
                H2Writer::new(request_body).compat_write(),
                rpc_twoparty_capnp::Side::Server,
                Default::default(),
            ));
            let rpc = RpcSystem::new(network, Some(bootstrap.client));
            tokio::task::spawn_local(async move { let _ = rpc.await; });

            let ready = tokio::time::timeout(Duration::from_secs(3), ready_rx).await.unwrap().unwrap().unwrap();
            assert_eq!(ready.details.location, "unit-pop");
            tokio::time::sleep(Duration::from_millis(50)).await;
            {
                let captured = captured.lock().unwrap();
                assert_eq!(captured.client_id, context.connector_id);
                assert_eq!(captured.previous_attempts, 7);
                assert!(!captured.replace_existing);
                assert_eq!(captured.features, ["serialized_headers"]);
                assert!(!captured.local_config.is_empty());
            }

            let request = http::Request::builder()
                .method("GET")
                .uri("https://unit.trycloudflare.com/health")
                .body(())
                .unwrap();
            let (response, _) = client.send_request(request, true).unwrap();
            let mut response = response.await.unwrap();
            assert_eq!(response.status(), 200);
            let data = response.body_mut().data().await.unwrap().unwrap();
            response.body_mut().flow_control().release_capacity(data.len()).unwrap();
            assert_eq!(&data[..], b"hello");

            let websocket_headers = headers::serialize_headers(&[
                ("Sec-WebSocket-Key".into(), "dW5pdA==".into()),
                ("Sec-WebSocket-Version".into(), "13".into()),
                ("Origin".into(), "https://unit.trycloudflare.com".into()),
            ]);
            let request = http::Request::builder()
                .method("GET")
                .uri("https://unit.trycloudflare.com/ws")
                .header(headers::INTERNAL_UPGRADE, headers::WEBSOCKET)
                .header(headers::REQUEST_USER_HEADERS, websocket_headers)
                .body(())
                .unwrap();
            let (response, mut websocket_body) = client.send_request(request, false).unwrap();
            let mut response = response.await.unwrap();
            assert_eq!(response.status(), 200);
            websocket_body.send_data(Bytes::from_static(b"ping"), true).unwrap();
            let echo = response.body_mut().data().await.unwrap().unwrap();
            response.body_mut().flow_control().release_capacity(echo.len()).unwrap();
            assert_eq!(&echo[..], b"ping");

            let _ = shutdown_tx.send(Some(Instant::now() + Duration::from_secs(2)));
            server.await.unwrap().unwrap();
            assert!(captured.lock().unwrap().unregistered);
        }).await;
    }
}
