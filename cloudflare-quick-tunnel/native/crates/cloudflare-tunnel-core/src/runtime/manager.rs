use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rand::Rng;
use tokio::sync::{broadcast, oneshot, watch};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::api::{request_tunnel, DEFAULT_SERVICE_URL, DEFAULT_USER_AGENT};
use crate::edge::connector;
use crate::edge::discovery::EdgeRegistry;
use crate::edge::tls;
use crate::origin::http1::Counters;
use crate::protocol::model::{RegistrationContext, TunnelAuth};
use crate::transport::h2::connection::{self, ReadyConnection, ServeParams};
use crate::TunnelError;

const CLIENT_VERSION: &str = concat!("dinotty/", env!("CARGO_PKG_VERSION"));
const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(9);
const DEFAULT_ATTEMPT_TIMEOUT: Duration = Duration::from_millis(3_750);
const DEFAULT_SHUTDOWN_GRACE: Duration = Duration::from_secs(30);
const DEFAULT_HA_CONNECTIONS: u8 = 2;
const MAX_HA_CONNECTIONS: u8 = 4;
const MAX_ATTEMPTS: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReactorState {
    Discovering,
    Connecting,
    Registering,
    Connected,
    Reconnecting,
    Draining,
    Exhausted,
    Stopped,
}

#[derive(Debug, Clone)]
pub struct ReactorEvent {
    pub conn_index: u8,
    pub state: ReactorState,
    pub attempt: u32,
    pub location: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, serde::Serialize)]
pub struct TunnelMetrics {
    pub streams_total: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub reconnects: u64,
}

pub struct QuickTunnelHandle {
    pub url: String,
    pub tunnel_id: Uuid,
    pub account_tag: String,
    pub location: String,
    reactor_count: usize,
    shutdown: watch::Sender<Option<Instant>>,
    reactors: Vec<tokio::task::JoinHandle<()>>,
    events: broadcast::Sender<ReactorEvent>,
    counters: Counters,
    reconnects: Arc<AtomicU64>,
}

impl QuickTunnelHandle {
    pub fn metrics(&self) -> TunnelMetrics {
        TunnelMetrics {
            streams_total: self.counters.streams_total.load(Ordering::Relaxed),
            bytes_in: self.counters.bytes_in.load(Ordering::Relaxed),
            bytes_out: self.counters.bytes_out.load(Ordering::Relaxed),
            reconnects: self.reconnects.load(Ordering::Relaxed),
        }
    }
    pub fn reactor_count(&self) -> usize {
        self.reactor_count
    }
    pub fn subscribe_reactor_events(&self) -> broadcast::Receiver<ReactorEvent> {
        self.events.subscribe()
    }
    pub async fn shutdown_with(self, grace: Duration) -> Result<(), TunnelError> {
        self.shutdown_until(Instant::now() + grace).await
    }
    pub async fn shutdown_until(mut self, deadline: Instant) -> Result<(), TunnelError> {
        let _ = self.shutdown.send(Some(deadline));
        for mut reactor in self.reactors.drain(..) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if tokio::time::timeout(remaining, &mut reactor).await.is_err() {
                reactor.abort();
            }
        }
        Ok(())
    }
    pub async fn shutdown(self) -> Result<(), TunnelError> {
        self.shutdown_with(DEFAULT_SHUTDOWN_GRACE).await
    }
}

impl Drop for QuickTunnelHandle {
    fn drop(&mut self) {
        let _ = self.shutdown.send(Some(Instant::now()));
    }
}

pub struct QuickTunnelManager {
    gateway_addr: SocketAddr,
    startup_timeout: Duration,
    service_url: String,
    user_agent: String,
    ha_connections: u8,
}

impl QuickTunnelManager {
    pub fn new(local_port: u16) -> Self {
        Self {
            gateway_addr: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), local_port),
            startup_timeout: DEFAULT_STARTUP_TIMEOUT,
            service_url: DEFAULT_SERVICE_URL.into(),
            user_agent: DEFAULT_USER_AGENT.into(),
            ha_connections: DEFAULT_HA_CONNECTIONS,
        }
    }
    pub fn with_gateway_addr(mut self, address: SocketAddr) -> Self {
        self.gateway_addr = address;
        self
    }
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.startup_timeout = timeout;
        self
    }
    pub fn with_service_url(mut self, url: impl Into<String>) -> Self {
        self.service_url = url.into();
        self
    }
    pub fn with_user_agent(mut self, value: impl Into<String>) -> Self {
        self.user_agent = value.into();
        self
    }
    pub fn with_ha_connections(mut self, count: u8) -> Self {
        self.ha_connections = count.clamp(1, MAX_HA_CONNECTIONS);
        self
    }
    pub async fn start(self) -> Result<QuickTunnelHandle, TunnelError> {
        self.start_with_cancel(CancellationToken::new()).await
    }
    pub async fn start_with_cancel(
        self,
        cancellation: CancellationToken,
    ) -> Result<QuickTunnelHandle, TunnelError> {
        if !self.gateway_addr.ip().is_loopback() {
            return Err(TunnelError::Internal(
                "production gateway address must be loopback".into(),
            ));
        }
        let timeout = self.startup_timeout;
        let startup_cancel = CancellationToken::new();
        let propagated_cancel = startup_cancel.clone();
        let background_cancellation = cancellation.clone();
        tokio::spawn(async move {
            background_cancellation.cancelled().await;
            propagated_cancel.cancel();
        });
        let startup = self.start_inner(startup_cancel.clone());
        tokio::pin!(startup);
        tokio::select! {
            _ = cancellation.cancelled() => {
                startup_cancel.cancel();
                Err(TunnelError::Shutdown)
            }
            result = tokio::time::timeout(timeout, &mut startup) => match result {
                Ok(result) => result,
                Err(_) => {
                    startup_cancel.cancel();
                    Err(TunnelError::EdgeDial {
                        attempts: 0,
                        last: format!("startup exceeded {timeout:?}"),
                    })
                }
            }
        }
    }

    async fn start_inner(
        self,
        cancellation: CancellationToken,
    ) -> Result<QuickTunnelHandle, TunnelError> {
        let tunnel = request_tunnel(&self.service_url, &self.user_agent).await?;
        let tunnel_id = Uuid::parse_str(&tunnel.id)
            .map_err(|error| TunnelError::Internal(format!("tunnel ID: {error}")))?;
        let hostname = tunnel
            .hostname
            .trim_start_matches("https://")
            .trim_end_matches('/')
            .to_string();
        let url = format!("https://{hostname}");
        let context = Arc::new(RegistrationContext::new(
            tunnel_id,
            TunnelAuth {
                account_tag: tunnel.account_tag.clone(),
                tunnel_secret: tunnel.secret,
            },
            hostname,
            self.gateway_addr,
            CLIENT_VERSION,
        ));
        let registry = EdgeRegistry::new();
        let tls = tls::client_config()?;
        let counters = Counters::default();
        let reconnects = Arc::new(AtomicU64::new(0));
        let (events, _) = broadcast::channel(128);
        let (shutdown_tx, shutdown_rx) = watch::channel(None);
        let attempt_timeout = self.startup_timeout.min(DEFAULT_ATTEMPT_TIMEOUT);
        let cancellation_shutdown = shutdown_tx.clone();
        tokio::spawn(async move {
            cancellation.cancelled().await;
            if cancellation_shutdown.borrow().is_none() {
                let _ = cancellation_shutdown.send(Some(Instant::now() + DEFAULT_SHUTDOWN_GRACE));
            }
        });

        let mut reactors = Vec::with_capacity(self.ha_connections as usize);
        let (ready_tx, ready_rx) = oneshot::channel();
        reactors.push(spawn_reactor(ReactorParams {
            conn_index: 0,
            context: context.clone(),
            registry: registry.clone(),
            tls: tls.clone(),
            attempt_timeout,
            counters: counters.clone(),
            reconnects: reconnects.clone(),
            events: events.clone(),
            shutdown: shutdown_rx.clone(),
            startup: Some(ready_tx),
        }));
        let first = ready_rx
            .await
            .map_err(|_| {
                TunnelError::Register("primary reactor stopped before registration".into())
            })?
            .map_err(TunnelError::Register)?;
        for conn_index in 1..self.ha_connections {
            reactors.push(spawn_reactor(ReactorParams {
                conn_index,
                context: context.clone(),
                registry: registry.clone(),
                tls: tls.clone(),
                attempt_timeout,
                counters: counters.clone(),
                reconnects: reconnects.clone(),
                events: events.clone(),
                shutdown: shutdown_rx.clone(),
                startup: None,
            }));
        }
        Ok(QuickTunnelHandle {
            url,
            tunnel_id,
            account_tag: tunnel.account_tag,
            location: first.details.location,
            reactor_count: self.ha_connections as usize,
            shutdown: shutdown_tx,
            reactors,
            events,
            counters,
            reconnects,
        })
    }
}

struct ReactorParams {
    conn_index: u8,
    context: Arc<RegistrationContext>,
    registry: EdgeRegistry,
    tls: Arc<rustls::ClientConfig>,
    attempt_timeout: Duration,
    counters: Counters,
    reconnects: Arc<AtomicU64>,
    events: broadcast::Sender<ReactorEvent>,
    shutdown: watch::Receiver<Option<Instant>>,
    startup: Option<oneshot::Sender<Result<ReadyConnection, String>>>,
}

fn spawn_reactor(params: ReactorParams) -> tokio::task::JoinHandle<()> {
    tokio::spawn(reactor(params))
}

async fn reactor(mut params: ReactorParams) {
    let mut failures = 0u32;
    let mut has_connected = false;
    loop {
        if params.shutdown.borrow().is_some() {
            break;
        }
        let _ = params.events.send(event(
            params.conn_index,
            ReactorState::Discovering,
            failures,
            None,
            None,
        ));
        let deadline = Instant::now() + params.attempt_timeout;
        let result = attempt(&mut params, failures, deadline).await;
        match result {
            Ok((ready, task)) => {
                if has_connected {
                    params.reconnects.fetch_add(1, Ordering::Relaxed);
                }
                has_connected = true;
                failures = 0;
                tracing::info!(
                    conn_index = params.conn_index,
                    connection_uuid = %ready.details.uuid,
                    edge = %ready.edge,
                    location = %ready.details.location,
                    "HTTP/2 tunnel connection registered"
                );
                let _ = params.events.send(event(
                    params.conn_index,
                    ReactorState::Connected,
                    0,
                    Some(ready.details.location.clone()),
                    None,
                ));
                if let Some(startup) = params.startup.take() {
                    let _ = startup.send(Ok(ready));
                }
                match task.await {
                    Ok(Ok(())) if params.shutdown.borrow().is_some() => break,
                    Ok(result) => tracing::warn!(
                        conn_index = params.conn_index,
                        ?result,
                        "edge connection ended"
                    ),
                    Err(error) => {
                        tracing::warn!(conn_index = params.conn_index, %error, "edge connection task failed")
                    }
                }
            }
            Err(error) => {
                failures += 1;
                if failures >= MAX_ATTEMPTS {
                    let message = error.to_string();
                    let _ = params.events.send(event(
                        params.conn_index,
                        ReactorState::Exhausted,
                        failures,
                        None,
                        Some(message.clone()),
                    ));
                    if let Some(startup) = params.startup.take() {
                        let _ = startup.send(Err(message));
                    }
                    return;
                }
            }
        }
        if params.shutdown.borrow().is_some() {
            break;
        }
        let delay = backoff(failures.max(1));
        let _ = params.events.send(event(
            params.conn_index,
            ReactorState::Reconnecting,
            failures,
            None,
            None,
        ));
        tokio::select! { _ = tokio::time::sleep(delay) => {}, _ = params.shutdown.changed() => break }
    }
    let _ = params.events.send(event(
        params.conn_index,
        ReactorState::Stopped,
        failures,
        None,
        None,
    ));
}

async fn attempt(
    params: &mut ReactorParams,
    failures: u32,
    deadline: Instant,
) -> Result<
    (
        ReadyConnection,
        tokio::task::JoinHandle<Result<(), TunnelError>>,
    ),
    TunnelError,
> {
    let candidates = tokio::time::timeout(
        deadline.saturating_duration_since(Instant::now()),
        params.registry.candidates(),
    )
    .await
    .map_err(|_| TunnelError::Discovery("edge discovery timed out".into()))??;
    let _ = params.events.send(event(
        params.conn_index,
        ReactorState::Connecting,
        failures,
        None,
        None,
    ));
    let edge = connector::dial(&candidates, params.tls.clone(), deadline).await?;
    let _ = params.events.send(event(
        params.conn_index,
        ReactorState::Registering,
        failures,
        None,
        None,
    ));
    let (ready_tx, ready_rx) = oneshot::channel();
    let mut task = tokio::spawn(connection::serve(ServeParams {
        edge,
        context: params.context.clone(),
        conn_index: params.conn_index,
        previous_attempts: failures,
        counters: params.counters.clone(),
        shutdown: params.shutdown.clone(),
        ready: Some(ready_tx),
    }));
    let ready =
        match tokio::time::timeout(deadline.saturating_duration_since(Instant::now()), ready_rx)
            .await
        {
            Ok(Ok(Ok(ready))) => ready,
            Ok(Ok(Err(error))) => {
                task.abort();
                let _ = task.await;
                return Err(TunnelError::Register(error));
            }
            Ok(Err(_)) => {
                let result = (&mut task).await;
                return Err(TunnelError::Register(format!(
                    "H2 connection stopped before registration: {result:?}"
                )));
            }
            Err(_) => {
                task.abort();
                let _ = task.await;
                return Err(TunnelError::Register(
                    "control stream/register deadline exceeded".into(),
                ));
            }
        };
    Ok((ready, task))
}

fn event(
    conn_index: u8,
    state: ReactorState,
    attempt: u32,
    location: Option<String>,
    error: Option<String>,
) -> ReactorEvent {
    ReactorEvent {
        conn_index,
        state,
        attempt,
        location,
        error,
    }
}

fn backoff(attempt: u32) -> Duration {
    let base = (1u64 << attempt.saturating_sub(1).min(4)).min(30);
    let jitter = rand::rng().random_range(0..=base.saturating_mul(250));
    Duration::from_millis(base * 1000 + jitter)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn startup_stops_immediately_when_host_lifetime_is_cancelled() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/tunnel"))
            .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(30)))
            .mount(&server)
            .await;
        let cancellation = CancellationToken::new();
        let cancel = cancellation.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            cancel.cancel();
        });

        let result = tokio::time::timeout(
            Duration::from_secs(1),
            QuickTunnelManager::new(9)
                .with_service_url(server.uri())
                .with_timeout(Duration::from_secs(10))
                .start_with_cancel(cancellation),
        )
        .await
        .expect("cancellation must not wait for the network timeout");
        assert!(matches!(result, Err(TunnelError::Shutdown)));
    }

    #[test]
    fn one_retry_fits_inside_the_startup_deadline() {
        assert_eq!(MAX_ATTEMPTS, 2);
        let maximum_first_backoff = Duration::from_millis(1_250);
        assert!(
            DEFAULT_ATTEMPT_TIMEOUT * MAX_ATTEMPTS + maximum_first_backoff
                <= DEFAULT_STARTUP_TIMEOUT
        );
    }

    #[test]
    fn backoff_is_bounded_and_has_jitter() {
        assert!(backoff(1) >= Duration::from_secs(1));
        assert!(backoff(20) < Duration::from_secs(38));
    }

    #[tokio::test]
    #[ignore]
    async fn live_quick_tunnel_registers_and_proxies_http2() {
        if std::env::var_os("CFQT_LIVE_TESTS").is_none() {
            return;
        }
        let _ = tracing_subscriber::fmt().with_test_writer().try_init();
        use futures::{SinkExt, StreamExt};
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio_tungstenite::tungstenite::client::IntoClientRequest;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    return;
                };
                tokio::spawn(async move {
                    let mut preview = [0u8; 8192];
                    loop {
                        let count = stream.peek(&mut preview).await.unwrap_or(0);
                        if count == 0 {
                            return;
                        }
                        if preview[..count].windows(4).any(|part| part == b"\r\n\r\n") {
                            break;
                        }
                        tokio::task::yield_now().await;
                    }
                    if String::from_utf8_lossy(&preview)
                        .to_ascii_lowercase()
                        .contains("upgrade: websocket")
                    {
                        let mut websocket = tokio_tungstenite::accept_async(stream).await.unwrap();
                        if let Some(Ok(message)) = websocket.next().await {
                            websocket.send(message).await.unwrap();
                        }
                        return;
                    }
                    let mut stream = stream;
                    let mut head = Vec::new();
                    let mut byte = [0u8; 1];
                    while !head.ends_with(b"\r\n\r\n") {
                        if stream.read_exact(&mut byte).await.is_err() {
                            return;
                        }
                        head.push(byte[0]);
                    }
                    let head_text = String::from_utf8_lossy(&head).into_owned();
                    if let Some(length) = head_text.lines().find_map(|line| {
                        let line = line.to_ascii_lowercase();
                        line.strip_prefix("content-length:")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    }) {
                        let mut request_body = vec![0u8; length];
                        if stream.read_exact(&mut request_body).await.is_err() {
                            return;
                        }
                    }
                    if head_text
                        .to_ascii_lowercase()
                        .contains("transfer-encoding: chunked")
                    {
                        let mut terminal = [0u8; 5];
                        if stream.read_exact(&mut terminal).await.is_err() {
                            return;
                        }
                    }
                    if head_text.starts_with("GET /stream ") {
                        let payload = vec![b'x'; 128 * 1024];
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            payload.len()
                        );
                        let _ = stream.write_all(response.as_bytes()).await;
                        for chunk in payload.chunks(4096) {
                            let _ = stream.write_all(chunk).await;
                            tokio::task::yield_now().await;
                        }
                    } else {
                        let _ = stream
                            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 15\r\nConnection: close\r\n\r\ndinotty-h2-live")
                            .await;
                    }
                    let _ = stream.shutdown().await;
                    tokio::time::sleep(Duration::from_millis(100)).await;
                });
            }
        });
        let cancellation = CancellationToken::new();
        let handle = QuickTunnelManager::new(port)
            .with_ha_connections(2)
            .with_timeout(Duration::from_secs(45))
            .start_with_cancel(cancellation)
            .await
            .expect("live H2 registration");
        let mut events = handle.subscribe_reactor_events();
        tokio::time::timeout(Duration::from_secs(30), async {
            loop {
                let event = events.recv().await.expect("reactor event");
                if event.conn_index == 1 && event.state == ReactorState::Connected {
                    break;
                }
            }
        })
        .await
        .expect("second H2 connection registration");
        let public_hostname = url::Url::parse(&handle.url)
            .unwrap()
            .host_str()
            .unwrap()
            .to_string();
        let public_edge = tokio::net::lookup_host(("trycloudflare.com", 443))
            .await
            .unwrap()
            .next()
            .unwrap();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .resolve(&public_hostname, public_edge)
            .build()
            .unwrap();
        let mut body = None;
        for _ in 0..15 {
            match client.get(&handle.url).send().await {
                Ok(response) => {
                    let status = response.status();
                    let response_body = response.text().await.unwrap_or_default();
                    eprintln!("live public response: {status} {response_body:?}");
                    if status.is_success() {
                        body = Some(response_body);
                        break;
                    }
                }
                Err(error) => eprintln!("live public request failed: {error:?}"),
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        assert_eq!(body.as_deref(), Some("dinotty-h2-live"));

        let post = client
            .post(format!("{}/post", handle.url))
            .body("post-through-h2")
            .send()
            .await
            .unwrap();
        assert_eq!(post.status(), reqwest::StatusCode::OK);
        assert_eq!(post.text().await.unwrap(), "dinotty-h2-live");

        let streamed = client
            .get(format!("{}/stream", handle.url))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(streamed.len(), 128 * 1024);
        assert!(streamed.iter().all(|byte| *byte == b'x'));

        let tcp = tokio::net::TcpStream::connect(public_edge).await.unwrap();
        let server_name = rustls::pki_types::ServerName::try_from(public_hostname.clone()).unwrap();
        let public_tls = tokio_rustls::TlsConnector::from(tls::client_config().unwrap())
            .connect(server_name, tcp)
            .await
            .unwrap();
        let mut request = format!("wss://{public_hostname}/ws")
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("origin", http::HeaderValue::from_str(&handle.url).unwrap());
        let (mut websocket, _) = tokio_tungstenite::client_async(request, public_tls)
            .await
            .unwrap();
        websocket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                "websocket-through-h2".into(),
            ))
            .await
            .unwrap();
        assert_eq!(
            websocket
                .next()
                .await
                .unwrap()
                .unwrap()
                .into_text()
                .unwrap(),
            "websocket-through-h2"
        );
        handle.shutdown_with(Duration::from_secs(5)).await.unwrap();
    }
}
