# Cloudflare Tunnel

Development-only Dinotty plugin for a temporary, anonymous Cloudflare Quick Tunnel.
It runs a native Rust Supervisor and places an independently authenticated
Gateway in front of Dinotty. It does not install or execute `cloudflared`, use a
Cloudflare account, create DNS records, or modify Dinotty authentication
settings.

## Security boundary

- Every public HTTP request and WebSocket upgrade must pass the Gateway before
  an origin connection is attempted.
- By default, `prepare` generates a fresh 256-bit Share Access Key for every
  tunnel. Users may instead configure a persistent custom key. The plugin stores
  the current plaintext key so it can keep displaying and composing the share
  link; the native Gateway stores only a salted digest.
- Gateway sessions use a `Secure`, `HttpOnly`, `SameSite=Strict`, host-only
  cookie and are separate from Dinotty sessions.
- Host and Origin must match the exact URL allocated for the current generation.
- Authenticated public clients read a minimized runtime view from
  `GET /.dinotty-share/tunnel-status`. The response is private/no-store and
  excludes access keys, control capabilities, the loopback origin, local ports,
  and raw internal errors.
- `/api/auto-token` and Preview are blocked by the Gateway. Preview can only be
  enabled for the current run.
- Cloudflare terminates TLS and can observe credentials, cookies, terminal
  traffic, file traffic, and other application data. This plugin is access
  control, not end-to-end encryption.

Anyone with the Share Access Key is a temporary full Dinotty operator. A
terminal can execute commands as the Dinotty user; this is not a low-privilege
sharing mechanism.

## Development

The HTTP/2 transport architecture and migration plan is documented in
[`HTTP2_QUICK_TUNNEL_REFACTOR_PLAN.md`](./HTTP2_QUICK_TUNNEL_REFACTOR_PLAN.md).

Requirements: Rust 1.86+, Node.js 20+, and a Dinotty build containing the native
managed-process host changes described by the implementation plan.

```powershell
cd native
cargo test
cargo build --release

cd ..
npm install
npm run check
npm run build

New-Item -ItemType Directory -Force bin/windows-x86_64
Copy-Item native/target/release/dinotty-quick-tunnel-supervisor.exe `
  bin/windows-x86_64/dinotty-quick-tunnel-supervisor-0.1.0-p3.exe
```

Then dev-link this directory:

```powershell
$body = @{ path = (Get-Location).Path } | ConvertTo-Json -Compress
curl.exe -X POST http://127.0.0.1:8999/api/plugins/dev-link `
  -H "Content-Type: application/json" -d $body
```

The native commands are JSON-only and divided into three groups:

- Offline: `version`, `doctor --offline`, `prepare`
- Long-running: `run --generation <id>`
- Online: `status`, `stop`, `rotate-key-prepare`, `rotate-key-commit`,
  `rotate-key-cancel`, `revoke-sessions`, `set-preview`, `doctor --online`

Online commands use a random loopback control capability stored with private
runtime state. The Supervisor reads the host-owned stdin lifetime lease and
also watches `DINOTTY_PARENT_PID`; a shutdown frame, EOF, or parent-process exit
revokes sessions and closes the tunnel. Abrupt host loss uses a one-second drain
budget so a stale child cannot keep the instance lock.

The plugin treats managed-process state and tunnel state separately. Local
clients read `status` through the Supervisor; authenticated public clients use
the Gateway status view. Polls are serialized and back off after failures. A
failed refresh preserves the last confirmed state as stale instead of reporting
the tunnel as stopped. While startup is cancellable, hovering the connecting
button reveals `Cancel`; preparation and shutdown transitions remain locked to
avoid racing a generation that does not yet have a managed process handle.

## Transport and limitations

- Same-origin browser clients only. curl, Agent clients, and third-party
  WebSocket origins are not supported.
- The edge transport is HTTP/2 over TLS/TCP only. Outbound TCP/7844 must be
  allowed; no UDP socket, QUIC fallback, or `cloudflared` process is used.
- Edge discovery interleaves IPv4 and IPv6. Quick Tunnel API and edge traffic
  connect directly; the plugin does not support an upstream proxy.
- Initial API, discovery, TCP/TLS/H2, and registration work shares one 45-second
  native deadline, leaving process overhead inside the UI's 50-second limit.
  Quick Tunnel API 5xx and network failures are retried up to four times with
  exponential backoff; edge connection attempts keep their own bounded retry policy.
- Cloudflare Quick Tunnels have no SLA and may impose additional limits. SSE is
  not claimed as supported.
- Dinotty keeps two independently registered H2 edge connections after live
  validation against Quick Tunnel; `cloudflared` itself defaults Quick Tunnels
  to one. If every configured HA reactor exhausts its retry budget, the generation enters `error`.
  It never silently allocates a replacement URL.
- Formal Marketplace publication is blocked until Dinotty accepts and
  implements the Native Artifact Signing RFC. Development installation is the
  only supported distribution path today.

## Audited core

The Rust core is project-owned and derived from `cloudflare-quick-tunnel 0.3.1`.
Its provenance is recorded in
`native/crates/cloudflare-tunnel-core/UPSTREAM.md`; the HTTP/2 wire behavior is
pinned in `PROTOCOL_COMPATIBILITY.md`. Run the workspace gate after any protocol
or dependency update:

```powershell
cargo fmt --manifest-path native/Cargo.toml --all -- --check
cargo test --manifest-path native/Cargo.toml --workspace
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets -- -D warnings
npm run check
npm run build
```
