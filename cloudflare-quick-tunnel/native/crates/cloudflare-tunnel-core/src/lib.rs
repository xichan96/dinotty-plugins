//! Dinotty's HTTP/2-only Cloudflare Quick Tunnel core.

#[allow(
    clippy::all,
    unused,
    non_camel_case_types,
    non_upper_case_globals,
    non_snake_case
)]
mod tunnelrpc_capnp {
    include!("protocol/generated/tunnelrpc_capnp.rs");
}

mod api;
mod edge;
mod error;
mod origin;
mod protocol;
mod runtime;
mod transport;

pub use error::TunnelError;
pub use runtime::{
    QuickTunnelHandle, QuickTunnelManager, ReactorEvent, ReactorState, TunnelMetrics,
};
