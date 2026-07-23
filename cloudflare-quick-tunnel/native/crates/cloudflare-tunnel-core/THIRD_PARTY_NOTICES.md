# Third-party notices - `dinotty-cloudflare-tunnel-core`

## Derived Rust crate

This crate is derived from `cloudflare-quick-tunnel 0.3.1` at commit
`baeefc821105eb75d1794e3103efe33ee7f26b47`. The original project copyright,
MIT/Apache-2.0 licenses, metadata, and provenance are retained in this crate.
Dinotty has replaced the original QUIC transport with its own HTTP/2/TCP
implementation; derivation history remains documented in `UPSTREAM.md`.

## cloudflared assets and protocol reference

- Repository: <https://github.com/cloudflare/cloudflared>
- Release: `2026.7.2`
- Commit: `8679787525edc8575b2948a7c4a50b6292c6d426`
- License: Apache-2.0

The only Cloudflare-authored assets shipped in the crate are the two Cap'n
Proto schemas, three edge CA certificate PEM blocks, and the Apache license
under `third_party/cloudflared`. Their exact sources and SHA-256 values are in
`third_party/cloudflared/VERSION.md`.

The Rust implementation uses `cloudflared` as a behavioral protocol reference.
No Go source is copied, compiled, downloaded, or executed at runtime.
