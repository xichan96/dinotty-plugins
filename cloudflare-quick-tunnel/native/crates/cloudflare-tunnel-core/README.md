# Dinotty Cloudflare Tunnel Core

This is Dinotty's project-owned Rust core for Cloudflare Quick Tunnel edge
connectivity. It is an internal workspace crate and is not published to
crates.io.

The production runtime is HTTP/2 over TLS/TCP only. It does not contain a QUIC
runtime or automatic transport fallback. See `PROTOCOL_COMPATIBILITY.md` at the
repository root for the pinned wire contract.

The crate owns:

- Quick Tunnel credential acquisition and edge discovery;
- edge registration and connection lifecycle;
- inbound request proxying to the loopback Dinotty Gateway;
- reactor events, metrics, diagnostics, and graceful shutdown.

Edge connections are direct TCP. TLS uses `h2.cftunnel.com` SNI with no ALPN,
and the local process is the HTTP/2 server because Cloudflare opens the streams
in the reverse direction.

Only the stable manager, handle, event, metric, error, and diagnostic types are
exported. Transport and generated protocol modules remain crate-private.

## Build

From the repository root:

```powershell
cargo test --manifest-path native/Cargo.toml --workspace
```

Cap'n Proto bindings are pre-generated, so a normal build does not require the
`capnp` compiler.

## Provenance and license

This crate is derived from `cloudflare-quick-tunnel 0.3.1`. The original
package metadata is retained in `Cargo.toml.orig` and `.cargo_vcs_info.json`;
the exact source and Dinotty modifications are recorded in `UPSTREAM.md`.

The derived crate remains licensed under `MIT OR Apache-2.0`. See
`THIRD_PARTY_NOTICES.md`, `LICENSE-MIT`, and `LICENSE-APACHE`.
