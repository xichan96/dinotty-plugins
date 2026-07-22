use std::sync::atomic::Ordering;
use std::time::Duration;

use bytes::Bytes;
use h2::RecvStream;
use http::Request;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

use super::http1::{self, Counters};
use crate::protocol::headers;
use crate::transport::h2::body::send_data;
use crate::TunnelError;

pub(crate) async fn proxy(
    gateway: std::net::SocketAddr,
    hostname: &str,
    request: Request<RecvStream>,
    mut respond: h2::server::SendResponse<Bytes>,
    counters: Counters,
) -> Result<(), TunnelError> {
    let (parts, mut body) = request.into_parts();
    let authority = http1::validate_authority(&parts.uri, &parts.headers, hostname)?;
    let serialized = headers::request_user_headers(&parts.headers)?;
    http1::validate_serialized_host(&serialized, &authority)?;
    let stream = tokio::time::timeout(Duration::from_secs(5), TcpStream::connect(gateway))
        .await
        .map_err(|_| TunnelError::Internal("WebSocket origin connect timed out".into()))?
        .map_err(|error| TunnelError::Internal(format!("WebSocket origin connect: {error}")))?;
    let (read, mut write) = stream.into_split();
    write
        .write_all(&http1::websocket_request_head(
            &parts.method,
            &parts.uri,
            &authority,
            &parts.headers,
            &serialized,
        )?)
        .await
        .map_err(|error| TunnelError::Internal(format!("WebSocket request: {error}")))?;
    let mut read = BufReader::new(read);
    let (status, response_headers) = http1::read_response_head(&mut read).await?;
    if status != 101 {
        return Err(TunnelError::Internal(format!(
            "origin rejected WebSocket upgrade with {status}"
        )));
    }
    let response = headers::response_headers(status, &response_headers)?;
    let mut output = respond
        .send_response(response, false)
        .map_err(|error| TunnelError::Http2(format!("WebSocket response: {error}")))?;
    let incoming = counters.bytes_in.clone();
    let outgoing = counters.bytes_out.clone();
    let edge_to_origin = async {
        while let Some(data) = body.data().await {
            let Ok(data) = data else {
                break;
            };
            body.flow_control()
                .release_capacity(data.len())
                .map_err(|error| TunnelError::Http2(format!("WebSocket flow control: {error}")))?;
            write.write_all(&data).await.map_err(|error| {
                TunnelError::Internal(format!("WebSocket origin write: {error}"))
            })?;
            incoming.fetch_add(data.len() as u64, Ordering::Relaxed);
        }
        write
            .shutdown()
            .await
            .map_err(|error| TunnelError::Internal(format!("WebSocket origin shutdown: {error}")))
    };
    let origin_to_edge = async {
        let mut buffer = vec![0u8; 16 * 1024];
        loop {
            let count = read.read(&mut buffer).await.map_err(|error| {
                TunnelError::Internal(format!("WebSocket origin read: {error}"))
            })?;
            if count == 0 {
                break;
            }
            outgoing.fetch_add(count as u64, Ordering::Relaxed);
            send_data(&mut output, Bytes::copy_from_slice(&buffer[..count]), false)
                .await
                .map_err(|error| TunnelError::Http2(format!("WebSocket response body: {error}")))?;
        }
        send_data(&mut output, Bytes::new(), true)
            .await
            .map_err(|error| TunnelError::Http2(format!("WebSocket response close: {error}")))
    };
    let (left, right) = tokio::join!(edge_to_origin, origin_to_edge);
    left?;
    right
}
