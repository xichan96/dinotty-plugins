use base64::engine::general_purpose::STANDARD_NO_PAD;
use base64::Engine;
use http::{HeaderMap, HeaderName, HeaderValue};

use crate::TunnelError;

pub(crate) const INTERNAL_UPGRADE: &str = "cf-cloudflared-proxy-connection-upgrade";
pub(crate) const INTERNAL_TCP_SOURCE: &str = "cf-cloudflared-proxy-src";
pub(crate) const REQUEST_USER_HEADERS: &str = "cf-cloudflared-request-headers";
pub(crate) const RESPONSE_USER_HEADERS: &str = "cf-cloudflared-response-headers";
pub(crate) const RESPONSE_META: &str = "cf-cloudflared-response-meta";
pub(crate) const CONTROL_STREAM: &str = "control-stream";
pub(crate) const WEBSOCKET: &str = "websocket";
pub(crate) const CONFIGURATION: &str = "update-configuration";

const MAX_SERIALIZED_HEADERS: usize = 64 * 1024;
const MAX_HEADER_COUNT: usize = 200;

pub(crate) fn deserialize_headers(
    value: &str,
) -> Result<Vec<(HeaderName, HeaderValue)>, TunnelError> {
    if value.len() > MAX_SERIALIZED_HEADERS {
        return Err(TunnelError::Http2(
            "serialized request headers exceed limit".into(),
        ));
    }
    let mut headers = Vec::new();
    for pair in value.split(';').filter(|part| !part.is_empty()) {
        if headers.len() >= MAX_HEADER_COUNT {
            return Err(TunnelError::Http2(
                "too many serialized request headers".into(),
            ));
        }
        let (name, value) = pair
            .split_once(':')
            .filter(|(_, value)| !value.contains(':'))
            .ok_or_else(|| TunnelError::Http2("invalid serialized request header".into()))?;
        let name = STANDARD_NO_PAD
            .decode(name)
            .map_err(|_| TunnelError::Http2("invalid base64 request header name".into()))?;
        let value = STANDARD_NO_PAD
            .decode(value)
            .map_err(|_| TunnelError::Http2("invalid base64 request header value".into()))?;
        let name = HeaderName::from_bytes(&name)
            .map_err(|_| TunnelError::Http2("invalid request header name".into()))?;
        let value = HeaderValue::from_bytes(&value)
            .map_err(|_| TunnelError::Http2("invalid request header value".into()))?;
        headers.push((name, value));
    }
    Ok(headers)
}

pub(crate) fn serialize_headers(headers: &[(String, String)]) -> String {
    let mut output = String::new();
    for (name, value) in headers {
        if !output.is_empty() {
            output.push(';');
        }
        output.push_str(&STANDARD_NO_PAD.encode(name.as_bytes()));
        output.push(':');
        output.push_str(&STANDARD_NO_PAD.encode(value.as_bytes()));
    }
    output
}

pub(crate) fn response_headers(
    status: u16,
    headers: &[(String, String)],
) -> Result<http::Response<()>, TunnelError> {
    let mut builder = http::Response::builder().status(if status == 101 { 200 } else { status });
    let mut user = Vec::new();
    for (name, value) in headers {
        let lower = name.to_ascii_lowercase();
        let control = lower.starts_with(':')
            || lower.starts_with("cf-int-")
            || lower.starts_with("cf-cloudflared-")
            || lower.starts_with("cf-proxy-");
        let websocket = matches!(
            lower.as_str(),
            "sec-websocket-accept" | "connection" | "upgrade"
        );
        if lower == "content-length" {
            builder = builder.header(name, value);
        }
        let hop_by_hop = matches!(
            lower.as_str(),
            "transfer-encoding" | "keep-alive" | "proxy-connection" | "te" | "trailer"
        ) || (matches!(lower.as_str(), "connection" | "upgrade") && status != 101);
        if (!control || websocket) && !hop_by_hop {
            user.push((name.clone(), value.clone()));
        }
    }
    builder = builder
        .header(RESPONSE_USER_HEADERS, serialize_headers(&user))
        .header(RESPONSE_META, r#"{"src":"origin"}"#);
    builder
        .body(())
        .map_err(|error| TunnelError::Http2(format!("response headers: {error}")))
}

pub(crate) fn error_response(status: u16, overloaded: bool) -> http::Response<()> {
    let meta = if overloaded {
        r#"{"src":"cloudflared","flow_rate_limited":true}"#
    } else {
        r#"{"src":"cloudflared"}"#
    };
    http::Response::builder()
        .status(status)
        .header(RESPONSE_META, meta)
        .body(())
        .expect("static error response")
}

pub(crate) fn request_user_headers(
    headers: &HeaderMap,
) -> Result<Vec<(HeaderName, HeaderValue)>, TunnelError> {
    match headers.get(REQUEST_USER_HEADERS) {
        Some(value) => deserialize_headers(
            value
                .to_str()
                .map_err(|_| TunnelError::Http2("non-ASCII serialized header".into()))?,
        ),
        None => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cloudflared_header_encoding_round_trips() {
        let headers = vec![
            ("X-Test".into(), "one;two:three".into()),
            ("CF-Ray".into(), "abc".into()),
        ];
        let decoded = deserialize_headers(&serialize_headers(&headers)).unwrap();
        assert_eq!(decoded[0].0.as_str(), "x-test");
        assert_eq!(decoded[0].1, "one;two:three");
    }

    #[test]
    fn websocket_101_maps_to_h2_200() {
        let response = response_headers(101, &[("Upgrade".into(), "websocket".into())]).unwrap();
        assert_eq!(response.status(), 200);
        assert!(response.headers().contains_key(RESPONSE_USER_HEADERS));
    }
}
