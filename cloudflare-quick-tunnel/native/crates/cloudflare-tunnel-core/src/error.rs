use thiserror::Error;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct QuickTunnelApiError {
    pub code: i32,
    pub message: String,
}

#[derive(Error, Debug)]
pub enum TunnelError {
    #[error("quick-tunnel API request failed: {0}")]
    Api(#[from] reqwest::Error),
    #[error("quick-tunnel API returned business errors: {0:?}")]
    ApiBusiness(Vec<QuickTunnelApiError>),
    #[error("quick-tunnel API responded non-JSON ({status}): {body_snippet}")]
    ApiNonJson { status: u16, body_snippet: String },
    #[error("quick-tunnel API returned HTTP {status}: {body_snippet}")]
    ApiHttp { status: u16, body_snippet: String },
    #[error("edge discovery failed: {0}")]
    Discovery(String),
    #[error("edge TCP/TLS/HTTP2 dial failed after {attempts} attempt(s); last: {last}")]
    EdgeDial { attempts: usize, last: String },
    #[error("HTTP/2 protocol error: {0}")]
    Http2(String),
    #[error("capnp-RPC operation failed: {0}")]
    Register(String),
    #[error("connection lost; reactor giving up after {0} attempts")]
    PermanentFailure(u32),
    #[error("shutdown requested")]
    Shutdown,
    #[error("internal invariant violated: {0}")]
    Internal(String),
}
