use axum::http::{HeaderMap, HeaderName, HeaderValue};

pub const MAX_LOGIN_BODY_BYTES: usize = 4 * 1024;
pub const MAX_URI_BYTES: usize = 8 * 1024;
pub const MAX_SINGLE_HEADER_BYTES: usize = 8 * 1024;
pub const MAX_HEADER_BYTES: usize = 32 * 1024;
pub const MAX_HEADER_COUNT: usize = 100;
pub const MAX_REQUEST_BODY_BYTES: u64 = 1024 * 1024 * 1024;

const STRIP_REQUEST_HEADERS: &[&str] = &[
    "connection",
    "proxy-connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-real-ip",
    "cf-connecting-ip",
    "cf-ray",
    "cf-visitor",
];

pub fn validate_request_shape(uri: &http::Uri, headers: &HeaderMap) -> Result<(), &'static str> {
    let raw_uri = uri.to_string();
    if raw_uri.len() > MAX_URI_BYTES {
        return Err("URI exceeds limit");
    }
    let lower = raw_uri.to_ascii_lowercase();
    if raw_uri.contains('\\')
        || lower.contains("%2f")
        || lower.contains("%5c")
        || lower.contains("%2e")
        || uri
            .path()
            .split('/')
            .any(|segment| segment == "." || segment == "..")
    {
        return Err("ambiguous URI is not allowed");
    }
    if !valid_percent_encoding(&raw_uri) {
        return Err("invalid percent encoding");
    }
    if headers.len() > MAX_HEADER_COUNT {
        return Err("too many headers");
    }
    let mut total = 0_usize;
    for (name, value) in headers {
        let size = name.as_str().len() + value.as_bytes().len();
        if size > MAX_SINGLE_HEADER_BYTES {
            return Err("header exceeds limit");
        }
        total = total.saturating_add(size);
    }
    if total > MAX_HEADER_BYTES {
        return Err("headers exceed total limit");
    }
    let content_lengths = headers.get_all(http::header::CONTENT_LENGTH).iter().count();
    if content_lengths > 1
        || (content_lengths > 0 && headers.contains_key(http::header::TRANSFER_ENCODING))
    {
        return Err("ambiguous request framing");
    }
    Ok(())
}

pub fn policy_path(uri: &http::Uri) -> Result<String, &'static str> {
    percent_encoding::percent_decode_str(uri.path())
        .decode_utf8()
        .map(|value| value.into_owned())
        .map_err(|_| "URI path is not UTF-8")
}

fn valid_percent_encoding(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return false;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    true
}

pub fn sanitized_request_headers(source: &HeaderMap) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in source {
        if name == http::header::HOST
            || name == http::header::CONTENT_LENGTH
            || STRIP_REQUEST_HEADERS.contains(&name.as_str())
        {
            continue;
        }
        if name == http::header::COOKIE {
            if let Some(value) = strip_gateway_cookie(value) {
                headers.append(name.clone(), value);
            }
            continue;
        }
        headers.append(name.clone(), value.clone());
    }
    headers
}

pub fn sanitized_response_headers(source: &HeaderMap) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in source {
        if STRIP_REQUEST_HEADERS.contains(&name.as_str())
            || name == http::header::CONTENT_LENGTH
            || name == http::header::CACHE_CONTROL
            || name.as_str().eq_ignore_ascii_case("cdn-cache-control")
            || name
                .as_str()
                .eq_ignore_ascii_case("cloudflare-cdn-cache-control")
        {
            continue;
        }
        if name == http::header::SET_COOKIE
            && value
                .to_str()
                .is_ok_and(|raw| raw.trim_start().starts_with("__Host-dinotty_share="))
        {
            continue;
        }
        headers.append(name.clone(), value.clone());
    }
    headers.insert(
        http::header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    headers.insert(
        HeaderName::from_static("pragma"),
        HeaderValue::from_static("no-cache"),
    );
    headers
}

fn strip_gateway_cookie(value: &HeaderValue) -> Option<HeaderValue> {
    let raw = value.to_str().ok()?;
    let retained = raw
        .split(';')
        .map(str::trim)
        .filter(|part| !part.starts_with("__Host-dinotty_share="))
        .collect::<Vec<_>>()
        .join("; ");
    if retained.is_empty() {
        None
    } else {
        HeaderValue::from_str(&retained).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gateway_cookie_and_forwarded_headers_are_removed() {
        let mut source = HeaderMap::new();
        source.insert(
            http::header::COOKIE,
            HeaderValue::from_static("a=1; __Host-dinotty_share=secret; b=2"),
        );
        source.insert("x-forwarded-for", HeaderValue::from_static("127.0.0.1"));
        let clean = sanitized_request_headers(&source);
        assert_eq!(clean.get(http::header::COOKIE).unwrap(), "a=1; b=2");
        assert!(!clean.contains_key("x-forwarded-for"));
    }

    #[test]
    fn ambiguous_paths_and_framing_are_rejected() {
        let uri: http::Uri = "/preview/%2fsecret".parse().unwrap();
        assert!(validate_request_shape(&uri, &HeaderMap::new()).is_err());

        let mut headers = HeaderMap::new();
        headers.append(http::header::CONTENT_LENGTH, HeaderValue::from_static("1"));
        headers.append(http::header::CONTENT_LENGTH, HeaderValue::from_static("2"));
        assert!(validate_request_shape(&"/".parse().unwrap(), &headers).is_err());
    }

    #[test]
    fn policy_path_decodes_non_separator_escapes() {
        let uri: http::Uri = "/%70review/8999".parse().unwrap();
        assert_eq!(policy_path(&uri).unwrap(), "/preview/8999");
        let invalid: http::Uri = "/bad%zz".parse().unwrap();
        assert!(validate_request_shape(&invalid, &HeaderMap::new()).is_err());
    }
}
