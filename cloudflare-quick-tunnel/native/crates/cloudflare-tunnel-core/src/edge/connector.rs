use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use rustls::pki_types::ServerName;
use socket2::{SockRef, TcpKeepalive};
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;

use super::discovery::EdgeAddr;
use super::tls;
use crate::TunnelError;

const CANDIDATE_TIMEOUT: Duration = Duration::from_secs(8);
const KEEPALIVE_IDLE: Duration = Duration::from_secs(10);
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(5);

pub(crate) struct EdgeConnection {
    pub stream: TlsStream<TcpStream>,
    pub origin_local_ip: Option<IpAddr>,
    pub edge: EdgeAddr,
}

pub(crate) async fn dial(
    candidates: &[EdgeAddr],
    tls_config: Arc<rustls::ClientConfig>,
    deadline: Instant,
) -> Result<EdgeConnection, TunnelError> {
    let mut last = "no edge candidates".to_string();
    let mut attempts = 0;
    // A reactor owns the retry policy, so each attempt dials one randomized edge.
    for edge in candidates.iter().take(1) {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        attempts += 1;
        let timeout = remaining.min(CANDIDATE_TIMEOUT);
        let result = tokio::time::timeout(timeout, connect_one(*edge, tls_config.clone())).await;
        match result {
            Ok(Ok(connection)) => return Ok(connection),
            Ok(Err(error)) => last = error.to_string(),
            Err(_) => last = format!("{} timed out after {timeout:?}", edge.socket),
        }
    }
    Err(TunnelError::EdgeDial { attempts, last })
}

async fn connect_one(
    edge: EdgeAddr,
    config: Arc<rustls::ClientConfig>,
) -> Result<EdgeConnection, TunnelError> {
    let stream = TcpStream::connect(edge.socket)
        .await
        .map_err(|error| TunnelError::EdgeDial {
            attempts: 1,
            last: format!("TCP {}: {error}", edge.socket),
        })?;
    stream
        .set_nodelay(true)
        .map_err(|error| TunnelError::EdgeDial {
            attempts: 1,
            last: format!("TCP_NODELAY: {error}"),
        })?;
    let keepalive = TcpKeepalive::new()
        .with_time(KEEPALIVE_IDLE)
        .with_interval(KEEPALIVE_INTERVAL)
        .with_retries(3);
    SockRef::from(&stream)
        .set_tcp_keepalive(&keepalive)
        .map_err(|error| TunnelError::EdgeDial {
            attempts: 1,
            last: format!("TCP keepalive: {error}"),
        })?;
    let origin_local_ip = stream.local_addr().ok().map(|address| address.ip());
    let server_name = ServerName::try_from(tls::EDGE_TLS_SERVER_NAME)
        .map_err(|error| TunnelError::Internal(format!("edge SNI: {error}")))?
        .to_owned();
    let stream = tokio_rustls::TlsConnector::from(config)
        .connect(server_name, stream)
        .await
        .map_err(|error| TunnelError::EdgeDial {
            attempts: 1,
            last: format!("TLS {}: {error}", edge.socket),
        })?;
    if stream.get_ref().1.alpn_protocol().is_some() {
        return Err(TunnelError::EdgeDial {
            attempts: 1,
            last: "edge unexpectedly negotiated ALPN".into(),
        });
    }
    Ok(EdgeConnection {
        stream,
        origin_local_ip,
        edge,
    })
}
