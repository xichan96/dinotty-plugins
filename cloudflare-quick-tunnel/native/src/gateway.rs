use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::body::{to_bytes, Body};
use axum::extract::ws::{Message as AxumMessage, WebSocket};
use axum::extract::{Request, State, WebSocketUpgrade};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::any;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use subtle::ConstantTimeEq;
use tokio::sync::{Mutex, RwLock, Semaphore};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::auth::{generate_secret, LoginError, SecurityState};
use crate::bridge::{
    policy_path, sanitized_request_headers, sanitized_response_headers, validate_request_shape,
    MAX_LOGIN_BODY_BYTES, MAX_REQUEST_BODY_BYTES,
};
use crate::state::{now_secs, HostContext, Locale, RuntimeState};

const LOGIN_PATH: &str = "/.dinotty-share/login";
const LOGOUT_PATH: &str = "/.dinotty-share/logout";
const SESSION_PATH: &str = "/.dinotty-share/session";
const STATUS_PATH: &str = "/.dinotty-share/tunnel-status";
const LOGIN_CSRF_COOKIE: &str = "__Host-dinotty_share_csrf";

#[derive(Clone, Copy)]
enum LoginPageError {
    TooManyAttempts,
    InvalidKey,
    InvalidLink,
    SessionLimit,
    ExpiredForm,
}

struct LoginCopy {
    lang: &'static str,
    title: &'static str,
    eyebrow: &'static str,
    heading: &'static str,
    description: &'static str,
    access_key: &'static str,
    continue_securely: &'static str,
    footer: &'static str,
    too_many_attempts: &'static str,
    invalid_key: &'static str,
    invalid_link: &'static str,
    session_limit: &'static str,
    expired_form: &'static str,
}

impl Locale {
    fn login_copy(self) -> LoginCopy {
        match self {
            Self::En => LoginCopy {
                lang: "en",
                title: "Cloudflare Tunnel",
                eyebrow: "Private tunnel",
                heading: "Access this Dinotty tunnel",
                description: "The owner protected this temporary Dinotty tunnel with an access key.",
                access_key: "Access key",
                continue_securely: "Continue securely",
                footer: "Cloudflare transports this session; the key is never stored in your browser history.",
                too_many_attempts: "Too many attempts. Wait a minute, then try again.",
                invalid_key: "That access key is not correct. Check it and try again.",
                invalid_link: "The access key in this link is invalid.",
                session_limit: "This tunnel has reached its session limit. Ask the owner to revoke an old session.",
                expired_form: "This sign-in form has expired. Enter the access key again.",
            },
            Self::Zh => LoginCopy {
                lang: "zh-CN",
                title: "Cloudflare隧道",
                eyebrow: "专用隧道",
                heading: "进入 Dinotty 隧道",
                description: "隧道所有者已使用访问密钥保护此临时工作区。",
                access_key: "访问密钥",
                continue_securely: "安全进入",
                footer: "此会话由 Cloudflare 传输；访问密钥不会存入浏览器历史记录。",
                too_many_attempts: "尝试次数过多，请等待一分钟后重试。",
                invalid_key: "访问密钥不正确，请检查后重试。",
                invalid_link: "此链接中的访问密钥无效。",
                session_limit: "此隧道已达到会话上限，请联系所有者撤销旧会话。",
                expired_form: "此登录表单已过期，请重新输入访问密钥。",
            },
        }
    }
}

#[derive(Clone)]
pub struct GatewayState {
    pub host: HostContext,
    pub locale: Locale,
    pub expected_host: Arc<RwLock<Option<String>>>,
    pub expected_origin: Arc<RwLock<Option<String>>>,
    pub security: Arc<SecurityState>,
    pub runtime: Arc<RwLock<RuntimeState>>,
    pub preview_enabled: Arc<AtomicBool>,
    pub client: reqwest::Client,
    pub concurrency: Arc<Semaphore>,
    pub login_limiter: Arc<Mutex<LoginLimiter>>,
    pub session_epoch: tokio::sync::watch::Sender<u64>,
}

impl GatewayState {
    pub fn new(
        host: HostContext,
        security: Arc<SecurityState>,
        locale: Locale,
        runtime: Arc<RwLock<RuntimeState>>,
    ) -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .read_timeout(Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let (session_epoch, _) = tokio::sync::watch::channel(0);
        Ok(Self {
            host,
            locale,
            expected_host: Arc::new(RwLock::new(None)),
            expected_origin: Arc::new(RwLock::new(None)),
            security,
            runtime,
            preview_enabled: Arc::new(AtomicBool::new(false)),
            client,
            concurrency: Arc::new(Semaphore::new(200)),
            login_limiter: Arc::new(Mutex::new(LoginLimiter::default())),
            session_epoch,
        })
    }

    pub async fn set_public_url(&self, public_url: &str) -> anyhow::Result<()> {
        let url = url::Url::parse(public_url)?;
        let host = url
            .host_str()
            .ok_or_else(|| anyhow::anyhow!("tunnel URL has no host"))?;
        *self.expected_host.write().await = Some(host.to_string());
        *self.expected_origin.write().await = Some(format!("https://{host}"));
        Ok(())
    }

    pub fn revoke_live_sessions(&self) {
        let next = self.session_epoch.borrow().wrapping_add(1);
        self.session_epoch.send_replace(next);
    }
}

#[derive(Default)]
pub struct LoginLimiter {
    window_started: u64,
    global_failures: u32,
    by_ip: HashMap<String, u32>,
}

impl LoginLimiter {
    fn allow(&mut self, ip: Option<&str>) -> bool {
        let now = now_secs();
        if now.saturating_sub(self.window_started) >= 60 {
            self.window_started = now;
            self.global_failures = 0;
            self.by_ip.clear();
        }
        if self.global_failures >= if ip.is_some() { 60 } else { 30 } {
            return false;
        }
        ip.is_none_or(|ip| self.by_ip.get(ip).copied().unwrap_or_default() < 10)
    }

    fn record_failure(&mut self, ip: Option<&str>) {
        self.global_failures = self.global_failures.saturating_add(1);
        if let Some(ip) = ip {
            if self.by_ip.len() < 4096 || self.by_ip.contains_key(ip) {
                *self.by_ip.entry(ip.to_string()).or_default() += 1;
            }
        }
    }
}

pub fn router(state: GatewayState) -> Router {
    Router::new()
        .fallback(any(handle_request))
        .with_state(state)
}

async fn handle_request(
    State(state): State<GatewayState>,
    ws: Option<WebSocketUpgrade>,
    request: Request,
) -> Response {
    let Ok(_permit) = state.concurrency.clone().try_acquire_owned() else {
        return response_with_headers(StatusCode::SERVICE_UNAVAILABLE, "busy", true);
    };
    if let Err(error) = validate_request_shape(request.uri(), request.headers()) {
        let status = if error.contains("URI") {
            StatusCode::URI_TOO_LONG
        } else {
            StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE
        };
        return response_with_headers(status, error, true);
    }
    if !host_matches(&state, request.headers()).await {
        return response_with_headers(StatusCode::MISDIRECTED_REQUEST, "host mismatch", true);
    }

    let path = match policy_path(request.uri()) {
        Ok(path) => path,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, error),
    };
    if path == LOGIN_PATH && request.method() == Method::GET {
        return login_page(state.locale);
    }
    if path == LOGIN_PATH && request.method() == Method::POST {
        return login(state, request).await;
    }
    if matches!(*request.method(), Method::GET | Method::HEAD) {
        match access_key_from_query(request.uri()) {
            Ok(Some((key, clean_target))) => {
                return login_with_key(&state, &key, &clean_target).await;
            }
            Ok(None) => {}
            Err(error) => return json_error(StatusCode::BAD_REQUEST, error),
        }
    }

    let session = match gateway_cookie(request.headers()) {
        Ok(Some(value)) if state.security.validate_session(&value).await => value,
        _ => {
            if is_page_navigation(&request) {
                return Redirect::temporary(LOGIN_PATH).into_response();
            }
            return json_error(StatusCode::UNAUTHORIZED, "gateway authentication required");
        }
    };

    if path == SESSION_PATH && request.method() == Method::GET {
        return json_response(
            StatusCode::OK,
            &serde_json::json!({"ok": true, "authenticated": true}),
        );
    }
    if path == STATUS_PATH {
        if request.method() != Method::GET {
            let mut response = json_error(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
            response
                .headers_mut()
                .insert(header::ALLOW, HeaderValue::from_static("GET"));
            return response;
        }
        let mut response =
            json_response(StatusCode::OK, &state.runtime.read().await.public_status());
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, no-store"),
        );
        return response;
    }
    if path == LOGOUT_PATH && request.method() == Method::POST {
        if !origin_matches(&state, request.headers()).await {
            return json_error(StatusCode::FORBIDDEN, "origin rejected");
        }
        state.security.logout(&session).await;
        state.revoke_live_sessions();
        return clear_cookie_response();
    }
    if path.starts_with("/.dinotty-share/") {
        return json_error(StatusCode::NOT_FOUND, "reserved route not found");
    }
    if path == "/api/auto-token" || path.starts_with("/api/auto-token/") {
        return json_error(StatusCode::FORBIDDEN, "route blocked by tunnel policy");
    }
    if path.starts_with("/preview/") && !state.preview_enabled.load(Ordering::Relaxed) {
        return json_error(StatusCode::FORBIDDEN, "preview is disabled for this tunnel");
    }
    if requires_origin(request.method()) && !origin_matches(&state, request.headers()).await {
        return json_error(StatusCode::FORBIDDEN, "origin rejected");
    }
    if let Some(upgrade) = ws {
        if !origin_matches(&state, request.headers()).await {
            return json_error(StatusCode::FORBIDDEN, "origin rejected");
        }
        return proxy_websocket(state, upgrade, request).await;
    }
    proxy_http(state, request).await
}

async fn login(state: GatewayState, request: Request) -> Response {
    let origin_valid = origin_matches(&state, request.headers()).await;
    let csrf_cookie = cookie_value(request.headers(), LOGIN_CSRF_COOKIE)
        .ok()
        .flatten();
    let content_type = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !content_type.starts_with("application/x-www-form-urlencoded") {
        return json_error(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "form content type required",
        );
    }
    let source_ip = connecting_ip(request.headers());
    if !state.login_limiter.lock().await.allow(source_ip.as_deref()) {
        return login_page_with_error(
            state.locale,
            Some(LoginPageError::TooManyAttempts),
            StatusCode::TOO_MANY_REQUESTS,
        );
    }
    let bytes = match to_bytes(request.into_body(), MAX_LOGIN_BODY_BYTES).await {
        Ok(bytes) => bytes,
        Err(_) => return json_error(StatusCode::PAYLOAD_TOO_LARGE, "login body too large"),
    };
    let form: HashMap<String, String> = match serde_urlencoded::from_bytes(&bytes) {
        Ok(form) => form,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "invalid login form"),
    };
    let csrf_valid = csrf_cookie
        .as_deref()
        .zip(form.get("csrf_token").map(String::as_str))
        .is_some_and(|(cookie, form)| cookie.as_bytes().ct_eq(form.as_bytes()).into());
    if !origin_valid && !csrf_valid {
        return login_page_with_error(
            state.locale,
            Some(LoginPageError::ExpiredForm),
            StatusCode::FORBIDDEN,
        );
    }
    let key = form
        .get("access_key")
        .map(String::as_str)
        .unwrap_or_default();
    match state.security.login(key).await {
        Ok(session) => authenticated_redirect("/", &session),
        Err(LoginError::Invalid) => {
            state
                .login_limiter
                .lock()
                .await
                .record_failure(source_ip.as_deref());
            login_page_with_error(
                state.locale,
                Some(LoginPageError::InvalidKey),
                StatusCode::UNAUTHORIZED,
            )
        }
        Err(LoginError::SessionLimit) => login_page_with_error(
            state.locale,
            Some(LoginPageError::SessionLimit),
            StatusCode::SERVICE_UNAVAILABLE,
        ),
    }
}

async fn login_with_key(state: &GatewayState, key: &str, clean_target: &str) -> Response {
    if !state.login_limiter.lock().await.allow(None) {
        return json_error(StatusCode::TOO_MANY_REQUESTS, "too many login attempts");
    }
    match state.security.login(key).await {
        Ok(session) => authenticated_redirect(clean_target, &session),
        Err(LoginError::Invalid) => {
            state.login_limiter.lock().await.record_failure(None);
            login_page_with_error(
                state.locale,
                Some(LoginPageError::InvalidLink),
                StatusCode::UNAUTHORIZED,
            )
        }
        Err(LoginError::SessionLimit) => {
            json_error(StatusCode::SERVICE_UNAVAILABLE, "session limit reached")
        }
    }
}

fn authenticated_redirect(target: &str, session: &str) -> Response {
    let mut response = Response::builder()
        .status(StatusCode::SEE_OTHER)
        .header(header::LOCATION, target)
        .body(Body::empty())
        .unwrap();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "__Host-dinotty_share={session}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200"
        ))
        .unwrap(),
    );
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "__Host-dinotty_share_csrf=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        ),
    );
    add_security_headers(response.headers_mut(), true);
    response
}

fn access_key_from_query(uri: &http::Uri) -> Result<Option<(String, String)>, &'static str> {
    let Some(query) = uri.query() else {
        return Ok(None);
    };
    let mut key = None;
    let mut clean = url::form_urlencoded::Serializer::new(String::new());
    for (name, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if name == "access_key" {
            if key.replace(value.into_owned()).is_some() {
                return Err("access_key must appear only once");
            }
        } else {
            clean.append_pair(&name, &value);
        }
    }
    let Some(key) = key else { return Ok(None) };
    if key.is_empty() {
        return Err("access_key must not be empty");
    }
    let query = clean.finish();
    let target = if query.is_empty() {
        uri.path().to_string()
    } else {
        format!("{}?{query}", uri.path())
    };
    Ok(Some((key, target)))
}

async fn proxy_http(state: GatewayState, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let body = body.into_data_stream();
    if let Some(length) = parts
        .headers
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
    {
        if length > MAX_REQUEST_BODY_BYTES {
            return json_error(StatusCode::PAYLOAD_TOO_LARGE, "request body too large");
        }
    }
    let mut target = state.host.origin.clone();
    target.set_path(parts.uri.path());
    target.set_query(parts.uri.query());
    let mut total = 0_u64;
    let stream = body.map(move |chunk| -> Result<bytes::Bytes, std::io::Error> {
        let chunk = chunk.map_err(std::io::Error::other)?;
        total = total.saturating_add(chunk.len() as u64);
        if total > MAX_REQUEST_BODY_BYTES {
            return Err(std::io::Error::other("request body too large"));
        }
        Ok(chunk)
    });
    let mut upstream = state
        .client
        .request(parts.method, target)
        .headers(sanitized_request_headers(&parts.headers))
        .body(reqwest::Body::wrap_stream(stream));
    upstream = upstream.header(
        header::HOST,
        format!("127.0.0.1:{}", state.host.origin_port),
    );
    let response = match upstream.send().await {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return json_error(StatusCode::GATEWAY_TIMEOUT, "origin timeout")
        }
        Err(_) => return json_error(StatusCode::BAD_GATEWAY, "origin unavailable"),
    };
    let status = response.status();
    let headers = sanitized_response_headers(response.headers());
    let mut outgoing = Response::builder().status(status);
    *outgoing.headers_mut().unwrap() = headers;
    outgoing
        .body(Body::from_stream(response.bytes_stream()))
        .unwrap()
}

async fn proxy_websocket(
    state: GatewayState,
    upgrade: WebSocketUpgrade,
    request: Request,
) -> Response {
    let path = request
        .uri()
        .path_and_query()
        .map_or("/", |value| value.as_str());
    let url = format!("ws://127.0.0.1:{}{path}", state.host.origin_port);
    let mut upstream_request = match url.into_client_request() {
        Ok(request) => request,
        Err(_) => return json_error(StatusCode::BAD_GATEWAY, "invalid origin WebSocket URL"),
    };
    let clean = sanitized_request_headers(request.headers());
    for name in [
        header::AUTHORIZATION,
        header::COOKIE,
        header::ORIGIN,
        header::USER_AGENT,
        header::HeaderName::from_static("sec-websocket-protocol"),
    ] {
        if let Some(value) = clean.get(&name) {
            upstream_request.headers_mut().insert(name, value.clone());
        }
    }
    let upstream = match tokio_tungstenite::connect_async(upstream_request).await {
        Ok((socket, _)) => socket,
        Err(_) => return json_error(StatusCode::BAD_GATEWAY, "origin WebSocket unavailable"),
    };
    let revoked = state.session_epoch.subscribe();
    upgrade
        .on_upgrade(move |client| bridge_websocket(client, upstream, revoked))
        .into_response()
}

async fn bridge_websocket(
    client: WebSocket,
    upstream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    mut revoked: tokio::sync::watch::Receiver<u64>,
) {
    let (mut client_tx, mut client_rx) = client.split();
    let (mut upstream_tx, mut upstream_rx) = upstream.split();
    let session_deadline = tokio::time::sleep(Duration::from_secs(crate::auth::SESSION_TTL_SECS));
    tokio::pin!(session_deadline);
    loop {
        tokio::select! {
            _ = revoked.changed() => break,
            () = &mut session_deadline => break,
            message = client_rx.next() => match message {
                Some(Ok(message)) => {
                    let Some(message) = axum_to_tungstenite(message) else { break };
                    if upstream_tx.send(message).await.is_err() { break; }
                }
                _ => break,
            },
            message = upstream_rx.next() => match message {
                Some(Ok(message)) => {
                    let Some(message) = tungstenite_to_axum(message) else { break };
                    if client_tx.send(message).await.is_err() { break; }
                }
                _ => break,
            },
        }
    }
    let _ = client_tx.send(AxumMessage::Close(None)).await;
    let _ = upstream_tx.close().await;
}

fn axum_to_tungstenite(message: AxumMessage) -> Option<tokio_tungstenite::tungstenite::Message> {
    use tokio_tungstenite::tungstenite::Message;
    match message {
        AxumMessage::Text(value) => Some(Message::Text(value)),
        AxumMessage::Binary(value) => Some(Message::Binary(value)),
        AxumMessage::Ping(value) => Some(Message::Ping(value)),
        AxumMessage::Pong(value) => Some(Message::Pong(value)),
        AxumMessage::Close(_) => None,
    }
}

fn tungstenite_to_axum(message: tokio_tungstenite::tungstenite::Message) -> Option<AxumMessage> {
    use tokio_tungstenite::tungstenite::Message;
    match message {
        Message::Text(value) => Some(AxumMessage::Text(value)),
        Message::Binary(value) => Some(AxumMessage::Binary(value)),
        Message::Ping(value) => Some(AxumMessage::Ping(value)),
        Message::Pong(value) => Some(AxumMessage::Pong(value)),
        Message::Close(_) => None,
        Message::Frame(_) => None,
    }
}

async fn host_matches(state: &GatewayState, headers: &HeaderMap) -> bool {
    let expected = state.expected_host.read().await;
    let Some(expected) = expected.as_deref() else {
        return false;
    };
    headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        == Some(expected)
}

async fn origin_matches(state: &GatewayState, headers: &HeaderMap) -> bool {
    let expected = state.expected_origin.read().await;
    let Some(expected) = expected.as_deref() else {
        return false;
    };
    headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        == Some(expected)
}

fn gateway_cookie(headers: &HeaderMap) -> Result<Option<String>, ()> {
    cookie_value(headers, "__Host-dinotty_share")
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Result<Option<String>, ()> {
    let mut found = None;
    for value in headers.get_all(header::COOKIE) {
        let raw = value.to_str().map_err(|_| ())?;
        for cookie in raw.split(';').map(str::trim) {
            if let Some((cookie_name, value)) = cookie.split_once('=') {
                if cookie_name != name {
                    continue;
                }
                if found.is_some() || value.is_empty() {
                    return Err(());
                }
                found = Some(value.to_string());
            }
        }
    }
    Ok(found)
}

fn connecting_ip(headers: &HeaderMap) -> Option<String> {
    let mut values = headers.get_all("cf-connecting-ip").iter();
    let first = values.next()?.to_str().ok()?;
    if values.next().is_some() || first.parse::<std::net::IpAddr>().is_err() {
        return None;
    }
    Some(first.to_string())
}

fn requires_origin(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

fn is_page_navigation(request: &Request) -> bool {
    matches!(*request.method(), Method::GET | Method::HEAD)
        && request
            .headers()
            .get(header::ACCEPT)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("text/html"))
}

fn login_page(locale: Locale) -> Response {
    login_page_with_error(locale, None, StatusCode::OK)
}

fn login_page_with_error(
    locale: Locale,
    error: Option<LoginPageError>,
    status: StatusCode,
) -> Response {
    let copy = locale.login_copy();
    let csrf_token = generate_secret();
    let error = error.map_or_else(String::new, |error| {
        let message = match error {
            LoginPageError::TooManyAttempts => copy.too_many_attempts,
            LoginPageError::InvalidKey => copy.invalid_key,
            LoginPageError::InvalidLink => copy.invalid_link,
            LoginPageError::SessionLimit => copy.session_limit,
            LoginPageError::ExpiredForm => copy.expired_form,
        };
        format!(
            r#"<div class="error" role="alert"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.3 15 14H1L8 1.3Zm0 4.1v4.1m0 2.1v.1"/></svg><p>{message}</p></div>"#
        )
    });
    let html = r#"<!doctype html>
<html lang="{{LANG}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{TITLE}}</title>
  <style>
    :root{color-scheme:dark;--bg:#1e1e1e;--surface:#252526;--input:#2a2a2c;--border:#3c3c3c;--divider:#2d2d2d;--fg:#ccc;--bright:#d0d0d0;--muted:#858585;--accent:#8a8a8a;--accent-hover:#9e9e9e;--danger:#f44747;--success:#49cc90}
    *{box-sizing:border-box}
    html,body{min-height:100%}
    body{min-height:100vh;min-height:100dvh;margin:0;display:grid;place-items:center;padding:24px;color:var(--fg);font:13px/1.5 Inter,"Segoe UI",system-ui,-apple-system,sans-serif;background:var(--bg);-webkit-font-smoothing:antialiased}
    main{width:min(364px,100%);padding:32px 24px;animation:arrive .28s ease-out both}
    .brand{display:flex;align-items:center;gap:13px;margin-bottom:30px}
    .mark{display:grid;width:58px;height:58px;flex:0 0 58px;place-items:center;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:0 10px 30px #0003}
    .mark svg{width:34px;height:34px;fill:none;stroke:var(--bright);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .wordmark{margin:0;color:var(--bright);font-size:22px;font-weight:700;letter-spacing:-.02em}
    .eyebrow{display:flex;align-items:center;gap:6px;margin:2px 0 0;color:var(--muted);font-size:11px}
    .signal{width:6px;height:6px;border-radius:50%;background:var(--success);box-shadow:0 0 0 3px #49cc9018}
    header{margin-bottom:22px}
    h1{margin:0 0 7px;color:var(--bright);font-size:20px;line-height:1.25;font-weight:600;letter-spacing:-.012em}
    header>p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}
    .error{display:flex;align-items:flex-start;gap:9px;margin:0 0 16px;padding:10px 11px;border:1px solid #f4474740;border-radius:6px;background:#f447470d;color:#f6b6b6;font-size:12px}
    .error svg{width:15px;height:15px;flex:0 0 15px;margin-top:1px;fill:none;stroke:var(--danger);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
    .error p{margin:0}
    form{margin:0}
    label{display:block;margin-bottom:7px;color:var(--fg);font-size:12px;font-weight:500}
    input{width:100%;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:6px;outline:none;background:var(--input);color:var(--bright);font:14px/1 ui-monospace,"Cascadia Code",Consolas,monospace;transition:border-color .15s,box-shadow .15s}
    input:hover{border-color:#555}
    input:focus{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
    button{width:100%;height:40px;margin-top:10px;border:0;border-radius:6px;background:var(--accent);color:#fff;font:600 13px/1 Inter,"Segoe UI",system-ui,sans-serif;cursor:pointer;transition:background .15s,transform .1s}
    button:hover{background:var(--accent-hover)}button:active{transform:translateY(1px)}button:focus-visible{outline:2px solid var(--bright);outline-offset:2px}
    footer{display:flex;align-items:flex-start;gap:8px;margin-top:24px;padding-top:16px;border-top:1px solid var(--divider);color:var(--muted);font-size:11px;line-height:1.5}
    footer svg{width:13px;height:13px;flex:0 0 13px;margin-top:1px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    @keyframes arrive{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @media(max-width:420px){body{place-items:start center;padding:calc(22px + env(safe-area-inset-top)) 14px calc(22px + env(safe-area-inset-bottom))}main{padding:20px 10px}.brand{margin-bottom:26px}}
    @media(prefers-reduced-motion:reduce){main{animation:none}input,button{transition:none}}
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 36 36"><rect x="3.5" y="4.5" width="29" height="27" rx="4"/><path d="M3.5 11.5h29M9 8h.1m4 0h.1m4 0h.1M11 19l4 3-4 3m7 0h7"/></svg>
      </div>
      <div><p class="wordmark">Dinotty</p><p class="eyebrow"><span class="signal"></span>{{EYEBROW}}</p></div>
    </div>
    <header>
      <h1>{{HEADING}}</h1>
      <p>{{DESCRIPTION}}</p>
    </header>
    {{ERROR_MESSAGE}}
    <form method="post" action="/.dinotty-share/login">
      <input name="csrf_token" type="hidden" value="{{CSRF_TOKEN}}">
      <label for="key">{{ACCESS_KEY}}</label>
      <input id="key" name="access_key" type="password" autocomplete="current-password" spellcheck="false" autofocus required>
      <button type="submit">{{CONTINUE_SECURELY}}</button>
    </form>
    <footer><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="7" width="11" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg><span>{{FOOTER}}</span></footer>
  </main>
</body>
</html>"#
        .replace("{{LANG}}", copy.lang)
        .replace("{{TITLE}}", copy.title)
        .replace("{{EYEBROW}}", copy.eyebrow)
        .replace("{{HEADING}}", copy.heading)
        .replace("{{DESCRIPTION}}", copy.description)
        .replace("{{ERROR_MESSAGE}}", &error)
        .replace("{{CSRF_TOKEN}}", csrf_token.as_str())
        .replace("{{ACCESS_KEY}}", copy.access_key)
        .replace("{{CONTINUE_SECURELY}}", copy.continue_securely)
        .replace("{{FOOTER}}", copy.footer);
    let mut response = (status, Html(html)).into_response();
    add_security_headers(response.headers_mut(), true);
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{LOGIN_CSRF_COOKIE}={}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600",
            csrf_token.as_str()
        ))
        .expect("generated CSRF token is a valid cookie value"),
    );
    response.headers_mut().insert(
        header::CONTENT_LANGUAGE,
        HeaderValue::from_static(copy.lang),
    );
    response.headers_mut().insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static("default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"));
    response
}

fn clear_cookie_response() -> Response {
    let mut response = json_response(StatusCode::OK, &serde_json::json!({"ok": true}));
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "__Host-dinotty_share=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        ),
    );
    response
}

fn json_error(status: StatusCode, error: &str) -> Response {
    json_response(status, &serde_json::json!({"ok": false, "error": error}))
}

fn json_response(status: StatusCode, value: &impl Serialize) -> Response {
    let mut response = (status, axum::Json(value)).into_response();
    add_security_headers(response.headers_mut(), true);
    response
}

fn response_with_headers(status: StatusCode, message: &str, no_store: bool) -> Response {
    let mut response = (status, message.to_string()).into_response();
    add_security_headers(response.headers_mut(), no_store);
    response
}

fn add_security_headers(headers: &mut HeaderMap, no_store: bool) {
    if no_store {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::digest_secret;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tower::ServiceExt;

    async fn test_router_and_runtime(locale: Locale) -> (Router, Arc<RwLock<RuntimeState>>) {
        let host = HostContext {
            origin: url::Url::parse("http://127.0.0.1:65534").unwrap(),
            origin_port: 65534,
            host_target: "windows-x86_64".into(),
            host_version: "0.17.2".into(),
            host_mode: "test".into(),
        };
        let security = Arc::new(SecurityState::new(digest_secret("correct-key")));
        let mut status = RuntimeState::stopped("http://127.0.0.1:65534/".into());
        status.state = "connected".into();
        status.generation_id = Some("test-generation".into());
        status.public_url = Some("https://example.trycloudflare.com".into());
        status.edge_location = Some("test01".into());
        status.gateway.healthy = true;
        let runtime = Arc::new(RwLock::new(status));
        let state = GatewayState::new(host, security, locale, Arc::clone(&runtime)).unwrap();
        state
            .set_public_url("https://example.trycloudflare.com")
            .await
            .unwrap();
        (router(state), runtime)
    }

    async fn test_router_with_locale(locale: Locale) -> Router {
        test_router_and_runtime(locale).await.0
    }

    async fn test_router() -> Router {
        test_router_with_locale(Locale::En).await
    }

    #[tokio::test]
    async fn unauthenticated_request_is_rejected_before_origin_connect() {
        let app = test_router().await;
        for path in ["/api/settings", STATUS_PATH] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header(header::HOST, "example.trycloudflare.com")
                        .header(header::ACCEPT, "application/json")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
    }

    #[tokio::test]
    async fn authenticated_status_is_live_no_store_and_sanitized() {
        let (app, runtime) = test_router_and_runtime(Locale::En).await;
        let login = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::ORIGIN, "https://example.trycloudflare.com")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("access_key=correct-key"))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie = login
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .find_map(|value| {
                let value = value.to_str().ok()?;
                value
                    .starts_with("__Host-dinotty_share=")
                    .then(|| value.split(';').next().unwrap().to_string())
            })
            .unwrap();

        runtime.write().await.metrics.streams_total = 42;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(STATUS_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "private, no-store"
        );
        let body = to_bytes(response.into_body(), 16 * 1024).await.unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["source"], "share-gateway");
        assert_eq!(value["state"], "connected");
        assert_eq!(value["connected"], true);
        assert_eq!(value["generationId"], "test-generation");
        assert_eq!(value["publicUrl"], "https://example.trycloudflare.com");
        assert_eq!(value["metrics"]["streamsTotal"], 42);
        assert!(value["gateway"].get("origin").is_none());

        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(STATUS_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::ORIGIN, "https://example.trycloudflare.com")
                    .header(header::COOKIE, cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(response.headers().get(header::ALLOW).unwrap(), "GET");
    }

    #[tokio::test]
    async fn login_cookie_is_hardened_and_reserved_routes_stay_blocked() {
        let app = test_router().await;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::ORIGIN, "https://example.trycloudflare.com")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("access_key=correct-key"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(response.status().is_redirection());
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cookie.contains("Secure"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
        let pair = cookie.split(';').next().unwrap();

        for path in ["/api/auto-token", "/preview/8999/"] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header(header::HOST, "example.trycloudflare.com")
                        .header(header::COOKIE, pair)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
        }
    }

    #[tokio::test]
    async fn login_form_csrf_token_allows_post_when_origin_is_not_forwarded() {
        let app = test_router().await;
        let page = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let csrf_cookie = page
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .find_map(|value| {
                let value = value.to_str().ok()?;
                value
                    .starts_with(&format!("{LOGIN_CSRF_COOKIE}="))
                    .then(|| value.split(';').next().unwrap().to_string())
            })
            .unwrap();
        let body = to_bytes(page.into_body(), MAX_LOGIN_BODY_BYTES * 8)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        let marker = "name=\"csrf_token\" type=\"hidden\" value=\"";
        let csrf_token = body
            .split_once(marker)
            .and_then(|(_, rest)| rest.split_once('\"'))
            .map(|(value, _)| value)
            .unwrap();

        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::COOKIE, csrf_cookie)
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from(format!(
                        "access_key=correct-key&csrf_token={csrf_token}"
                    )))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(
            response
                .headers()
                .get_all(header::SET_COOKIE)
                .iter()
                .count(),
            2
        );
    }

    #[tokio::test]
    async fn login_without_origin_or_csrf_renders_a_fresh_form() {
        let response = test_router()
            .await
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("access_key=correct-key"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        assert!(response.headers().contains_key(header::SET_COOKIE));
        let body = to_bytes(response.into_body(), MAX_LOGIN_BODY_BYTES * 8)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(body.contains("<title>Cloudflare Tunnel</title>"));
        assert!(body.contains("This sign-in form has expired"));
        assert!(body.contains("name=\"csrf_token\""));
    }

    #[tokio::test]
    async fn invalid_form_login_renders_the_login_page_with_an_error() {
        let response = test_router()
            .await
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::ORIGIN, "https://example.trycloudflare.com")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("access_key=wrong-key"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        let body = to_bytes(response.into_body(), MAX_LOGIN_BODY_BYTES * 8)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(body.contains("That access key is not correct"));
        assert!(body.contains("role=\"alert\""));
        assert!(body.contains("name=\"access_key\""));
    }

    #[tokio::test]
    async fn chinese_locale_renders_the_login_page_and_errors_in_chinese() {
        let app = test_router_with_locale(Locale::Zh).await;
        let page = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            page.headers().get(header::CONTENT_LANGUAGE).unwrap(),
            "zh-CN"
        );
        let body = to_bytes(page.into_body(), MAX_LOGIN_BODY_BYTES * 8)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(body.contains("<html lang=\"zh-CN\">"));
        assert!(body.contains("Cloudflare隧道"));
        assert!(body.contains("进入 Dinotty 隧道"));

        let error = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::ORIGIN, "https://example.trycloudflare.com")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("access_key=wrong-key"))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(error.into_body(), MAX_LOGIN_BODY_BYTES * 8)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(body.contains("访问密钥不正确，请检查后重试。"));
    }

    #[tokio::test]
    async fn access_key_query_creates_session_and_redirects_to_clean_url() {
        let app = test_router().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/?view=terminal&access_key=correct-key")
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::ACCEPT, "text/html")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(
            response.headers().get(header::LOCATION).unwrap(),
            "/?view=terminal"
        );
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cookie.contains("HttpOnly"));
        assert!(!response
            .headers()
            .get(header::LOCATION)
            .unwrap()
            .to_str()
            .unwrap()
            .contains("access_key"));
    }

    #[tokio::test]
    async fn host_and_origin_must_match_exactly() {
        let app = test_router().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "evil.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::MISDIRECTED_REQUEST);
    }

    #[tokio::test]
    async fn authenticated_websocket_crosses_real_gateway() {
        let upstream_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin_port = upstream_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (stream, _) = upstream_listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            if let Some(Ok(message)) = socket.next().await {
                socket.send(message).await.unwrap();
            }
        });

        let host = HostContext {
            origin: url::Url::parse(&format!("http://127.0.0.1:{origin_port}")).unwrap(),
            origin_port,
            host_target: "windows-x86_64".into(),
            host_version: "0.17.2".into(),
            host_mode: "test".into(),
        };
        let security = Arc::new(SecurityState::new(digest_secret("correct-key")));
        let runtime = Arc::new(RwLock::new(RuntimeState::stopped(format!(
            "http://127.0.0.1:{origin_port}/"
        ))));
        let state = GatewayState::new(host, security, Locale::En, runtime).unwrap();
        state
            .set_public_url("https://example.trycloudflare.com")
            .await
            .unwrap();
        let app = router(state);
        let login = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(LOGIN_PATH)
                    .header(header::HOST, "example.trycloudflare.com")
                    .header(header::ORIGIN, "https://example.trycloudflare.com")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("access_key=correct-key"))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie = login
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let gateway_addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let mut request = format!("ws://{gateway_addr}/socket")
            .into_client_request()
            .unwrap();
        request.headers_mut().insert(
            header::HOST,
            HeaderValue::from_static("example.trycloudflare.com"),
        );
        request.headers_mut().insert(
            header::ORIGIN,
            HeaderValue::from_static("https://example.trycloudflare.com"),
        );
        request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        let (mut socket, response) = tokio_tungstenite::connect_async(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                "through-gateway".into(),
            ))
            .await
            .unwrap();
        let echoed = socket.next().await.unwrap().unwrap();
        assert_eq!(echoed.into_text().unwrap(), "through-gateway");
        server.abort();
    }
}
