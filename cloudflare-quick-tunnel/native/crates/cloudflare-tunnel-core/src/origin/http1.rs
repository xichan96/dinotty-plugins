use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use h2::{RecvStream, SendStream};
use http::{HeaderName, HeaderValue, Method, Request};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

use crate::protocol::headers;
use crate::transport::h2::body::send_data;
use crate::TunnelError;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_HEAD_BYTES: usize = 64 * 1024;
const MAX_HEADERS: usize = 200;

#[derive(Clone, Default)]
pub(crate) struct Counters {
    pub streams_total: Arc<AtomicU64>,
    pub bytes_in: Arc<AtomicU64>,
    pub bytes_out: Arc<AtomicU64>,
}

pub(crate) async fn proxy(
    gateway: std::net::SocketAddr,
    hostname: &str,
    request: Request<RecvStream>,
    respond: h2::server::SendResponse<Bytes>,
    counters: Counters,
) -> Result<(), TunnelError> {
    let (parts, body) = request.into_parts();
    let authority = validate_authority(&parts.uri, &parts.headers, hostname)?;
    let user_headers = headers::request_user_headers(&parts.headers)?;
    validate_serialized_host(&user_headers, &authority)?;
    let content_length = content_length(&parts.headers, &user_headers)?;
    let stream = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(gateway))
        .await
        .map_err(|_| TunnelError::Internal("origin connect timed out".into()))?
        .map_err(|error| TunnelError::Internal(format!("origin connect: {error}")))?;
    let (read, mut write) = stream.into_split();
    let head = request_head(
        &parts.method,
        &parts.uri,
        &authority,
        &parts.headers,
        &user_headers,
        content_length,
        false,
    )?;
    write.write_all(&head).await.map_err(origin_io)?;

    let request_counter = counters.bytes_in.clone();
    let (response_done_tx, response_done_rx) = tokio::sync::oneshot::channel();
    let request_body = async move {
        let result = write_request_body(body, &mut write, content_length, &request_counter).await;
        if result.is_ok() {
            // Hyper treats a client FIN before it writes the response as an aborted
            // request. Keep the write half alive after the framed body is complete.
            let _ = response_done_rx.await;
        } else {
            let _ = write.shutdown().await;
        }
        result
    };
    let response_counter = counters.bytes_out.clone();
    let response = async move {
        let result = forward_response(
            parts.method,
            BufReader::new(read),
            respond,
            response_counter,
        )
        .await;
        let _ = response_done_tx.send(());
        result
    };
    let (request_result, response_result) = tokio::join!(request_body, response);
    request_result?;
    response_result
}

pub(crate) fn validate_authority(
    uri: &http::Uri,
    direct: &http::HeaderMap,
    hostname: &str,
) -> Result<String, TunnelError> {
    let authority = uri
        .authority()
        .map(|value| value.as_str())
        .or_else(|| direct.get("host").and_then(|value| value.to_str().ok()))
        .ok_or_else(|| TunnelError::Http2("request has no :authority".into()))?;
    let parsed: http::uri::Authority = authority
        .parse()
        .map_err(|_| TunnelError::Http2("invalid :authority".into()))?;
    if !parsed.host().eq_ignore_ascii_case(hostname) {
        return Err(TunnelError::Http2(
            "request authority is not the Quick Tunnel hostname".into(),
        ));
    }
    if let Some(host) = direct.get("host") {
        if !host.as_bytes().eq_ignore_ascii_case(authority.as_bytes()) {
            return Err(TunnelError::Http2("Host and :authority disagree".into()));
        }
    }
    Ok(authority.into())
}

fn request_head(
    method: &Method,
    uri: &http::Uri,
    authority: &str,
    direct: &http::HeaderMap,
    serialized: &[(HeaderName, HeaderValue)],
    content_length: Option<u64>,
    websocket: bool,
) -> Result<Vec<u8>, TunnelError> {
    let path = uri.path_and_query().map_or("/", |value| value.as_str());
    if path.bytes().any(|byte| matches!(byte, b'\r' | b'\n' | 0)) {
        return Err(TunnelError::Http2("invalid request path".into()));
    }
    let mut output = format!("{method} {path} HTTP/1.1\r\nHost: {authority}\r\n").into_bytes();
    let mut append = |name: &HeaderName, value: &HeaderValue| -> Result<(), TunnelError> {
        let lower = name.as_str();
        if is_filtered_request_header(lower, websocket) {
            return Ok(());
        }
        output.extend_from_slice(name.as_str().as_bytes());
        output.extend_from_slice(b": ");
        output.extend_from_slice(value.as_bytes());
        output.extend_from_slice(b"\r\n");
        Ok(())
    };
    for (name, value) in direct {
        append(name, value)?;
    }
    for (name, value) in serialized {
        append(name, value)?;
    }
    if websocket {
        output.extend_from_slice(b"Connection: Upgrade\r\nUpgrade: websocket\r\n");
    } else if let Some(content_length) = content_length {
        output.extend_from_slice(format!("Content-Length: {content_length}\r\n").as_bytes());
    } else {
        output.extend_from_slice(b"Transfer-Encoding: chunked\r\n");
    }
    if !websocket {
        output.extend_from_slice(b"Connection: close\r\n");
    }
    output.extend_from_slice(b"\r\n");
    Ok(output)
}

fn is_filtered_request_header(name: &str, websocket: bool) -> bool {
    name.eq_ignore_ascii_case("host")
        // The edge sends Content-Length both directly and in serialized user headers.
        // Re-emit the validated value once when the HTTP/1 request head is complete.
        || name.eq_ignore_ascii_case("content-length")
        || name.eq_ignore_ascii_case("transfer-encoding")
        || name.eq_ignore_ascii_case("connection")
        || name.eq_ignore_ascii_case("upgrade")
        || name.eq_ignore_ascii_case(headers::REQUEST_USER_HEADERS)
        || name.eq_ignore_ascii_case(headers::INTERNAL_UPGRADE)
        || name.starts_with("cf-int-")
        || name.starts_with("cf-cloudflared-")
        || matches!(
            name.to_ascii_lowercase().as_str(),
            "keep-alive" | "proxy-connection" | "te" | "trailer"
        )
        || (!websocket && name.eq_ignore_ascii_case("sec-websocket-key"))
}

pub(crate) fn validate_serialized_host(
    headers: &[(HeaderName, HeaderValue)],
    authority: &str,
) -> Result<(), TunnelError> {
    for (_, value) in headers.iter().filter(|(name, _)| name == "host") {
        if !value.as_bytes().eq_ignore_ascii_case(authority.as_bytes()) {
            return Err(TunnelError::Http2(
                "serialized Host and :authority disagree".into(),
            ));
        }
    }
    Ok(())
}

fn content_length(
    direct: &http::HeaderMap,
    serialized: &[(HeaderName, HeaderValue)],
) -> Result<Option<u64>, TunnelError> {
    if direct.contains_key("transfer-encoding") {
        return Err(TunnelError::Http2(
            "Transfer-Encoding is invalid on H2 requests".into(),
        ));
    }
    if let Some(te) = direct.get("te") {
        if !te.as_bytes().eq_ignore_ascii_case(b"trailers") {
            return Err(TunnelError::Http2("H2 TE only permits trailers".into()));
        }
    }
    let mut values = direct.get_all("content-length").iter().chain(
        serialized
            .iter()
            .filter(|(name, _)| name == "content-length")
            .map(|(_, value)| value),
    );
    let first = values.next().map(parse_length).transpose()?;
    for value in values {
        if Some(parse_length(value)?) != first {
            return Err(TunnelError::Http2("conflicting Content-Length".into()));
        }
    }
    Ok(first)
}

fn parse_length(value: &HeaderValue) -> Result<u64, TunnelError> {
    value
        .to_str()
        .ok()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| TunnelError::Http2("invalid Content-Length".into()))
}

async fn write_request_body(
    mut body: RecvStream,
    output: &mut tokio::net::tcp::OwnedWriteHalf,
    length: Option<u64>,
    counter: &AtomicU64,
) -> Result<(), TunnelError> {
    let mut received = 0u64;
    while let Some(data) = body.data().await {
        let data = data.map_err(|error| TunnelError::Http2(format!("request body: {error}")))?;
        body.flow_control()
            .release_capacity(data.len())
            .map_err(|error| TunnelError::Http2(format!("request flow control: {error}")))?;
        received = received
            .checked_add(data.len() as u64)
            .ok_or_else(|| TunnelError::Http2("request body length overflow".into()))?;
        if length.is_some_and(|expected| received > expected) {
            return Err(TunnelError::Http2(
                "request body exceeds Content-Length".into(),
            ));
        }
        if length.is_none() {
            output
                .write_all(format!("{:x}\r\n", data.len()).as_bytes())
                .await
                .map_err(origin_io)?;
        }
        output.write_all(&data).await.map_err(origin_io)?;
        if length.is_none() {
            output.write_all(b"\r\n").await.map_err(origin_io)?;
        }
        counter.fetch_add(data.len() as u64, Ordering::Relaxed);
    }
    if body
        .trailers()
        .await
        .map_err(|error| TunnelError::Http2(format!("request trailers: {error}")))?
        .is_some_and(|trailers| !trailers.is_empty())
    {
        return Err(TunnelError::Http2(
            "request trailers are not supported".into(),
        ));
    }
    if let Some(expected) = length {
        if received != expected {
            return Err(TunnelError::Http2(format!(
                "request body ended at {received}, expected {expected}"
            )));
        }
    } else {
        output.write_all(b"0\r\n\r\n").await.map_err(origin_io)?;
    }
    Ok(())
}

pub(crate) async fn read_response_head<R: tokio::io::AsyncRead + Unpin>(
    input: &mut BufReader<R>,
) -> Result<(u16, Vec<(String, String)>), TunnelError> {
    let mut total = 0;
    loop {
        let status_line = read_line(input, &mut total).await?;
        let mut parts = status_line.trim_end().splitn(3, ' ');
        let version = parts.next().unwrap_or("");
        let status: u16 = parts
            .next()
            .and_then(|value| value.parse().ok())
            .ok_or_else(|| TunnelError::Internal("invalid origin status line".into()))?;
        if !version.starts_with("HTTP/1.") {
            return Err(TunnelError::Internal("invalid origin HTTP version".into()));
        }
        let mut headers = Vec::new();
        loop {
            let line = read_line(input, &mut total).await?;
            if line == "\r\n" {
                break;
            }
            if headers.len() >= MAX_HEADERS {
                return Err(TunnelError::Internal(
                    "too many origin response headers".into(),
                ));
            }
            let (name, value) = line
                .trim_end_matches("\r\n")
                .split_once(':')
                .ok_or_else(|| TunnelError::Internal("invalid origin response header".into()))?;
            HeaderName::from_bytes(name.as_bytes())
                .map_err(|_| TunnelError::Internal("invalid origin header name".into()))?;
            HeaderValue::from_str(value.trim())
                .map_err(|_| TunnelError::Internal("invalid origin header value".into()))?;
            headers.push((name.into(), value.trim().into()));
        }
        if !(100..200).contains(&status) || status == 101 {
            return Ok((status, headers));
        }
    }
}

async fn read_line<R: tokio::io::AsyncRead + Unpin>(
    input: &mut BufReader<R>,
    total: &mut usize,
) -> Result<String, TunnelError> {
    let mut line = String::new();
    let count = input.read_line(&mut line).await.map_err(origin_io)?;
    if count == 0 || !line.ends_with("\r\n") {
        return Err(TunnelError::Internal(
            "truncated origin response head".into(),
        ));
    }
    *total += count;
    if *total > MAX_HEAD_BYTES {
        return Err(TunnelError::Internal(
            "origin response head exceeds limit".into(),
        ));
    }
    Ok(line)
}

async fn forward_response<R: tokio::io::AsyncRead + Unpin>(
    method: Method,
    mut input: BufReader<R>,
    mut respond: h2::server::SendResponse<Bytes>,
    counter: Arc<AtomicU64>,
) -> Result<(), TunnelError> {
    let (status, response_headers) = read_response_head(&mut input).await?;
    let response = headers::response_headers(status, &response_headers)?;
    let no_body =
        method == Method::HEAD || matches!(status, 101 | 204 | 304) || (100..200).contains(&status);
    let mut output = respond
        .send_response(response, no_body)
        .map_err(|error| TunnelError::Http2(format!("send response headers: {error}")))?;
    if no_body {
        return Ok(());
    }
    let transfer_chunked = response_headers.iter().any(|(name, value)| {
        name.eq_ignore_ascii_case("transfer-encoding")
            && value
                .split(',')
                .any(|part| part.trim().eq_ignore_ascii_case("chunked"))
    });
    let length = response_headers
        .iter()
        .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .map(|(_, value)| value.parse::<u64>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| TunnelError::Internal("invalid origin Content-Length".into()))?;
    if length.windows(2).any(|pair| pair[0] != pair[1]) {
        return Err(TunnelError::Internal(
            "conflicting origin Content-Length".into(),
        ));
    }
    if transfer_chunked {
        forward_chunked(&mut input, &mut output, &counter).await?;
    } else if let Some(length) = length.first() {
        forward_exact(&mut input, &mut output, *length, &counter).await?;
    } else {
        forward_to_eof(&mut input, &mut output, &counter).await?;
    }
    send_data(&mut output, Bytes::new(), true)
        .await
        .map_err(|error| TunnelError::Http2(format!("end response: {error}")))
}

async fn forward_exact<R: tokio::io::AsyncRead + Unpin>(
    input: &mut R,
    output: &mut SendStream<Bytes>,
    mut remaining: u64,
    counter: &AtomicU64,
) -> Result<(), TunnelError> {
    let mut buffer = vec![0u8; 16 * 1024];
    while remaining > 0 {
        let wanted = buffer.len().min(remaining as usize);
        let count = input.read(&mut buffer[..wanted]).await.map_err(origin_io)?;
        if count == 0 {
            return Err(TunnelError::Internal(format!(
                "origin body ended with {remaining} bytes missing"
            )));
        }
        remaining -= count as u64;
        counter.fetch_add(count as u64, Ordering::Relaxed);
        send_data(output, Bytes::copy_from_slice(&buffer[..count]), false)
            .await
            .map_err(|error| TunnelError::Http2(format!("response body: {error}")))?;
    }
    Ok(())
}

async fn forward_to_eof<R: tokio::io::AsyncRead + Unpin>(
    input: &mut R,
    output: &mut SendStream<Bytes>,
    counter: &AtomicU64,
) -> Result<(), TunnelError> {
    let mut buffer = vec![0u8; 16 * 1024];
    loop {
        let count = input.read(&mut buffer).await.map_err(origin_io)?;
        if count == 0 {
            return Ok(());
        }
        counter.fetch_add(count as u64, Ordering::Relaxed);
        send_data(output, Bytes::copy_from_slice(&buffer[..count]), false)
            .await
            .map_err(|error| TunnelError::Http2(format!("response body: {error}")))?;
    }
}

async fn forward_chunked<R: tokio::io::AsyncRead + Unpin>(
    input: &mut BufReader<R>,
    output: &mut SendStream<Bytes>,
    counter: &AtomicU64,
) -> Result<(), TunnelError> {
    loop {
        let mut line = String::new();
        input.read_line(&mut line).await.map_err(origin_io)?;
        let size = u64::from_str_radix(
            line.trim_end_matches("\r\n")
                .split(';')
                .next()
                .unwrap_or(""),
            16,
        )
        .map_err(|_| TunnelError::Internal("invalid origin chunk size".into()))?;
        if size == 0 {
            loop {
                line.clear();
                input.read_line(&mut line).await.map_err(origin_io)?;
                if line == "\r\n" {
                    return Ok(());
                }
                if line.is_empty() {
                    return Err(TunnelError::Internal("truncated origin trailers".into()));
                }
            }
        }
        forward_exact(input, output, size, counter).await?;
        let mut crlf = [0u8; 2];
        input.read_exact(&mut crlf).await.map_err(origin_io)?;
        if crlf != *b"\r\n" {
            return Err(TunnelError::Internal(
                "invalid origin chunk terminator".into(),
            ));
        }
    }
}

pub(crate) fn websocket_request_head(
    method: &Method,
    uri: &http::Uri,
    authority: &str,
    direct: &http::HeaderMap,
    serialized: &[(HeaderName, HeaderValue)],
) -> Result<Vec<u8>, TunnelError> {
    request_head(method, uri, authority, direct, serialized, Some(0), true)
}

fn origin_io(error: std::io::Error) -> TunnelError {
    TunnelError::Internal(format!("origin I/O: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authority_must_match_tunnel() {
        let uri: http::Uri = "https://other.example/path".parse().unwrap();
        assert!(
            validate_authority(&uri, &http::HeaderMap::new(), "unit.trycloudflare.com").is_err()
        );
    }

    #[test]
    fn request_head_emits_duplicate_content_length_once() {
        let mut direct = http::HeaderMap::new();
        direct.insert("content-length", HeaderValue::from_static("12"));
        let serialized = vec![
            (
                HeaderName::from_static("content-length"),
                HeaderValue::from_static("12"),
            ),
            (
                HeaderName::from_static("content-type"),
                HeaderValue::from_static("application/x-www-form-urlencoded"),
            ),
        ];
        let uri = "https://unit.trycloudflare.com/.dinotty-share/login"
            .parse()
            .unwrap();

        let head = request_head(
            &Method::POST,
            &uri,
            "unit.trycloudflare.com",
            &direct,
            &serialized,
            content_length(&direct, &serialized).unwrap(),
            false,
        )
        .unwrap();
        let head = String::from_utf8(head).unwrap();

        assert_eq!(head.matches("Content-Length: 12\r\n").count(), 1);
        assert_eq!(
            head.to_ascii_lowercase().matches("content-length:").count(),
            1
        );
        assert!(!head.contains("Transfer-Encoding"));
    }
}
