# Upstream provenance

- Crate: `cloudflare-quick-tunnel 0.3.1`
- Repository: `https://github.com/lordmacu/cloudflare-quick-tunnel-rs`
- Upstream commit recorded by crates.io: `baeefc821105eb75d1794e3103efe33ee7f26b47`
- crates.io package SHA-256: `b68774cc799ab0d7c35a00f8f7a7c28536a27478c1a09955b3541f0b6cf3ea03`
- Vendored: 2026-07-15

This directory is now a Dinotty-owned derived crate rather than a read-only
vendor copy. The original package metadata remains in `Cargo.toml.orig` and
`.cargo_vcs_info.json`; the original copyright and dual license remain in
place. Upstream `0.3.1` used a lossy `Notify` shutdown signal, ignored the
public shutdown grace argument, did not surface reactor exhaustion, and rebuilt
HTTP/1.1 without validating edge metadata first.

Changes present at the P1A migration baseline are:

1. persistent `CancellationToken` cancellation across start, connect, register,
   reconnect, and backoff;
2. deadline-aware reactor shutdown;
3. reactor lifecycle events; and
4. strict metadata/framing validation before HTTP/1.1 reconstruction.
5. promotion into the Dinotty Cargo workspace, package/lib renaming, and a
   stable public diagnostics boundary.

Run `cargo test --manifest-path native/Cargo.toml --workspace` after any
change. Updating the original Rust upstream requires a new source review and
checksum. HTTP/2 behavior is separately pinned to the cloudflared commit
recorded by the repository protocol compatibility documentation.

The P1B-P7 refactor replaced the inherited QUIC/UDP transport, QUIC stream
metadata schema, and SOCKS5 implementation with Dinotty-owned direct
TCP/TLS/HTTP2 modules. Registration now uses a manager-lifetime connector ID,
`replaceExisting=false`, accurate previous-attempt reporting, and the minimal
`serialized_headers` capability. The inherited HTTP/1.1 parser concepts were
retained where applicable, with H2 flow-control and framing tests added around
the new edge-facing implementation.
