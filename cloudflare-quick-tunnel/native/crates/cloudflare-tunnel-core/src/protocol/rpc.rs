use std::time::{Duration, Instant};

use capnp_rpc::{rpc_twoparty_capnp, twoparty, RpcSystem};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::{oneshot, watch};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use uuid::Uuid;

use super::model::{ConnectionOptions, RegistrationDetails, TunnelAuth};
use crate::tunnelrpc_capnp;
use crate::TunnelError;

pub(crate) const DEFAULT_RPC_TIMEOUT: Duration = Duration::from_secs(15);
const DUPLICATE_CONNECTION_ERROR: &str =
    "edge already has connection registered for the given connection identifier";

struct StubCloudflaredServer;
impl tunnelrpc_capnp::session_manager::Server for StubCloudflaredServer {}
impl tunnelrpc_capnp::configuration_manager::Server for StubCloudflaredServer {}
impl tunnelrpc_capnp::cloudflared_server::Server for StubCloudflaredServer {}

enum ShutdownCommand {
    Immediate,
    Graceful(Instant),
}

pub(crate) struct ControlSession {
    shutdown: Option<oneshot::Sender<ShutdownCommand>>,
    closed: watch::Receiver<bool>,
    done: Option<oneshot::Receiver<()>>,
    _thread: std::thread::JoinHandle<()>,
}

impl ControlSession {
    pub async fn closed(&mut self) {
        if *self.closed.borrow() {
            return;
        }
        let _ = self.closed.changed().await;
    }

    pub async fn shutdown_until(mut self, deadline: Instant) {
        if let Some(sender) = self.shutdown.take() {
            let _ = sender.send(ShutdownCommand::Graceful(deadline));
        }
        if let Some(done) = self.done.take() {
            let _ = tokio::time::timeout(deadline.saturating_duration_since(Instant::now()), done)
                .await;
        }
    }
}

impl Drop for ControlSession {
    fn drop(&mut self) {
        if let Some(sender) = self.shutdown.take() {
            let _ = sender.send(ShutdownCommand::Immediate);
        }
    }
}

pub(crate) async fn register_connection<R, W>(
    reader: R,
    writer: W,
    auth: &TunnelAuth,
    tunnel_id: Uuid,
    conn_index: u8,
    options: &ConnectionOptions,
    local_configuration: Option<Vec<u8>>,
) -> Result<(RegistrationDetails, ControlSession), TunnelError>
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let (result_tx, result_rx) = oneshot::channel();
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (done_tx, done_rx) = oneshot::channel();
    let (closed_tx, closed_rx) = watch::channel(false);
    let auth = auth.clone();
    let options = options.clone();

    let thread = std::thread::Builder::new()
        .name(format!("dinotty-h2-rpc-{conn_index}"))
        .spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("RPC runtime");
            tokio::task::LocalSet::new().block_on(&runtime, async move {
                let network = Box::new(twoparty::VatNetwork::new(
                    reader.compat(),
                    writer.compat_write(),
                    rpc_twoparty_capnp::Side::Client,
                    Default::default(),
                ));
                let stub: tunnelrpc_capnp::cloudflared_server::Client = capnp_rpc::new_client(StubCloudflaredServer);
                let mut rpc = RpcSystem::new(network, Some(stub.client));
                let server: tunnelrpc_capnp::registration_server::Client = rpc.bootstrap(rpc_twoparty_capnp::Side::Server);
                let request = match build_register_request(&server, &auth, tunnel_id, conn_index, &options) {
                    Ok(request) => request,
                    Err(error) => { let _ = result_tx.send(Err(error)); let _ = closed_tx.send(true); let _ = done_tx.send(()); return; }
                };
                let call = async {
                    let reply = request.send().promise.await.map_err(|error| TunnelError::Register(format!("RegisterConnection: {error}")))?;
                    let response = reply.get().map_err(|error| TunnelError::Register(format!("register response: {error}")))?;
                    let result = response.get_result().map_err(|error| TunnelError::Register(format!("register result: {error}")))?;
                    decode_connection_response(result)
                };
                tokio::pin!(call);
                let details = tokio::select! {
                    result = &mut call => result,
                    result = &mut rpc => Err(TunnelError::Register(format!("RPC driver stopped during registration: {result:?}"))),
                };
                let registered = details.is_ok();
                let remotely_managed = details.as_ref().map(|details| details.tunnel_is_remotely_managed).unwrap_or(true);
                let _ = result_tx.send(details);
                if !registered { let _ = closed_tx.send(true); let _ = done_tx.send(()); return; }

                if !remotely_managed {
                    if let Some(config) = local_configuration {
                        let mut request = server.update_local_configuration_request();
                        request.get().set_config(&config);
                        let update = request.send().promise;
                        tokio::pin!(update);
                        let update_result = tokio::time::timeout(Duration::from_secs(5), async {
                            tokio::select! { result = &mut update => result.map(|_| ()), _ = &mut rpc => Err(capnp::Error::failed("RPC driver stopped".into())) }
                        }).await;
                        if !matches!(update_result, Ok(Ok(()))) {
                            tracing::warn!(?update_result, "UpdateLocalConfiguration failed after registration");
                        }
                    }
                }

                let command = tokio::select! {
                    command = shutdown_rx => command.ok(),
                    _ = &mut rpc => None,
                };
                if let Some(ShutdownCommand::Graceful(deadline)) = command {
                    let request = server.unregister_connection_request().send().promise;
                    tokio::pin!(request);
                    let budget = deadline.saturating_duration_since(Instant::now());
                    let _ = tokio::time::timeout(budget, async {
                        tokio::select! { result = &mut request => result.map(|_| ()), _ = &mut rpc => Err(capnp::Error::failed("RPC driver stopped".into())) }
                    }).await;
                }
                drop(server);
                let _ = closed_tx.send(true);
                let _ = done_tx.send(());
            });
        })
        .map_err(|error| TunnelError::Internal(format!("spawn RPC driver: {error}")))?;

    let details = tokio::time::timeout(DEFAULT_RPC_TIMEOUT, result_rx)
        .await
        .map_err(|_| TunnelError::Register("RegisterConnection timed out".into()))?
        .map_err(|_| TunnelError::Register("RPC driver dropped registration result".into()))??;
    Ok((
        details,
        ControlSession {
            shutdown: Some(shutdown_tx),
            closed: closed_rx,
            done: Some(done_rx),
            _thread: thread,
        },
    ))
}

fn build_register_request(
    server: &tunnelrpc_capnp::registration_server::Client,
    auth: &TunnelAuth,
    tunnel_id: Uuid,
    conn_index: u8,
    options: &ConnectionOptions,
) -> Result<
    capnp::capability::Request<
        tunnelrpc_capnp::registration_server::register_connection_params::Owned,
        tunnelrpc_capnp::registration_server::register_connection_results::Owned,
    >,
    TunnelError,
> {
    let mut request = server.register_connection_request();
    let mut params = request.get();
    let mut encoded_auth = params.reborrow().init_auth();
    encoded_auth.set_account_tag(&auth.account_tag);
    encoded_auth.set_tunnel_secret(&auth.tunnel_secret);
    params.set_tunnel_id(tunnel_id.as_bytes());
    params.set_conn_index(conn_index);
    let mut encoded = params.reborrow().init_options();
    let mut client = encoded.reborrow().init_client();
    client.set_client_id(&options.client_id);
    client.set_version(&options.version);
    client.set_arch(&options.arch);
    let mut features = client.init_features(options.features.len() as u32);
    for (index, feature) in options.features.iter().enumerate() {
        features.set(index as u32, feature);
    }
    encoded.set_origin_local_ip(&options.origin_local_ip);
    encoded.set_replace_existing(options.replace_existing);
    encoded.set_compression_quality(options.compression_quality);
    encoded.set_num_previous_attempts(options.num_previous_attempts);
    Ok(request)
}

fn decode_connection_response(
    response: tunnelrpc_capnp::connection_response::Reader<'_>,
) -> Result<RegistrationDetails, TunnelError> {
    use tunnelrpc_capnp::connection_response::result::WhichReader;
    match response
        .get_result()
        .which()
        .map_err(|error| TunnelError::Register(format!("connection response: {error:?}")))?
    {
        WhichReader::Error(error) => {
            let error = error
                .map_err(|error| TunnelError::Register(format!("connection error: {error}")))?;
            let cause = error
                .get_cause()
                .ok()
                .and_then(|value| value.to_string().ok())
                .unwrap_or_else(|| "edge registration failed".into());
            if cause == DUPLICATE_CONNECTION_ERROR {
                return Err(TunnelError::Register(format!(
                    "duplicate connection: {cause}"
                )));
            }
            Err(TunnelError::Register(cause))
        }
        WhichReader::ConnectionDetails(details) => {
            let details = details
                .map_err(|error| TunnelError::Register(format!("connection details: {error}")))?;
            let bytes = details
                .get_uuid()
                .map_err(|error| TunnelError::Register(format!("connection UUID: {error}")))?;
            let uuid = Uuid::from_slice(bytes)
                .map_err(|error| TunnelError::Register(format!("connection UUID: {error}")))?;
            let location = details
                .get_location_name()
                .ok()
                .and_then(|value| value.to_string().ok())
                .unwrap_or_default();
            Ok(RegistrationDetails {
                uuid,
                location,
                tunnel_is_remotely_managed: details.get_tunnel_is_remotely_managed(),
            })
        }
    }
}
