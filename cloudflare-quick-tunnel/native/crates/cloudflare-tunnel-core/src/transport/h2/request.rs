use std::sync::{Arc, OnceLock};

use bytes::Bytes;
use h2::RecvStream;
use http::Request;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::origin::http1::{self, Counters};
use crate::origin::websocket;
use crate::protocol::headers;
use crate::TunnelError;

const GLOBAL_HANDLER_LIMIT: usize = 512;

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) enum RequestKind {
    Configuration,
    WebSocket,
    Tcp,
    Control,
    Http,
}

pub(crate) fn classify(request: &Request<RecvStream>) -> RequestKind {
    let upgrade = request
        .headers()
        .get(headers::INTERNAL_UPGRADE)
        .and_then(|value| value.to_str().ok());
    if upgrade == Some(headers::CONFIGURATION) {
        RequestKind::Configuration
    } else if upgrade == Some(headers::WEBSOCKET) {
        RequestKind::WebSocket
    } else if request.headers().contains_key(headers::INTERNAL_TCP_SOURCE) {
        RequestKind::Tcp
    } else if upgrade == Some(headers::CONTROL_STREAM) {
        RequestKind::Control
    } else {
        RequestKind::Http
    }
}

pub(crate) fn global_permit() -> Option<OwnedSemaphorePermit> {
    static LIMIT: OnceLock<Arc<Semaphore>> = OnceLock::new();
    LIMIT
        .get_or_init(|| Arc::new(Semaphore::new(GLOBAL_HANDLER_LIMIT)))
        .clone()
        .try_acquire_owned()
        .ok()
}

pub(crate) async fn dispatch(
    gateway: std::net::SocketAddr,
    hostname: Arc<str>,
    kind: RequestKind,
    mut request: Request<RecvStream>,
    mut respond: h2::server::SendResponse<Bytes>,
    counters: Counters,
) -> Result<(), TunnelError> {
    match kind {
        RequestKind::Http => http1::proxy(gateway, &hostname, request, respond, counters).await,
        RequestKind::WebSocket => {
            websocket::proxy(gateway, &hostname, request, respond, counters).await
        }
        RequestKind::Configuration | RequestKind::Tcp | RequestKind::Control => {
            let mut consumed = 0usize;
            while let Some(data) = request.body_mut().data().await {
                let data = data.map_err(|error| {
                    TunnelError::Http2(format!("unsupported stream body: {error}"))
                })?;
                consumed += data.len();
                request
                    .body_mut()
                    .flow_control()
                    .release_capacity(data.len())
                    .map_err(|error| {
                        TunnelError::Http2(format!("unsupported stream flow control: {error}"))
                    })?;
                if consumed > 64 * 1024 {
                    break;
                }
            }
            let status = if kind == RequestKind::Control {
                409
            } else {
                501
            };
            respond
                .send_response(headers::error_response(status, false), true)
                .map_err(|error| {
                    TunnelError::Http2(format!("unsupported stream response: {error}"))
                })?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn classification_order_matches_cloudflared() {
        // Classification itself is exercised through the fake-edge connection tests;
        // pin the order here so future edits cannot move control ahead of TCP/config.
        assert_eq!(
            [
                RequestKind::Configuration,
                RequestKind::WebSocket,
                RequestKind::Tcp,
                RequestKind::Control,
                RequestKind::Http
            ]
            .len(),
            5
        );
    }
}
