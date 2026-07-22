# Cloudflare Quick Tunnel HTTP/2 重构计划

状态：P0-P7 已完成；生产 transport 已切换为 HTTP/2/TCP
日期：2026-07-16
目标目录：`dinotty-plugins/cloudflare-quick-tunnel`

实施记录：

- P0：已在仓库同级保存源代码快照
  `dinotty-cloudflare-tunnel-p0-20260716.zip`，排除 `.git`、`node_modules`、`bin`
  和所有 `target`；SHA-256 为
  `377BB3E4A005828CC4F8697D9261356D8F481BD82412A3C11B9A8A00E67ACF55`。
- P1A：core 已迁移到 `native/crates/cloudflare-tunnel-core`，package/lib 已更名，
  Cargo workspace 和统一 lockfile 已建立，Supervisor 仅使用 manager public API。
  原始 package metadata、双许可证和 upstream provenance 已保留。
- P1A gate：core 28 passed、2 ignored；Supervisor 9 passed；workspace fmt、clippy
  `-D warnings`、TypeScript check/build 全部通过。
- P1B-P2：core 已按 `edge/protocol/transport/origin/runtime` 边界拆分；稳定
  connector context、SRV priority/weight、双栈交错和协议 fixtures 已落地。
  `cloudflared 2026.7.2` 资产、commit 和 SHA-256 记录在
  `PROTOCOL_COMPATIBILITY.md` 与 `third_party/cloudflared/VERSION.md`。
- P3-P5：direct TCP、空 ALPN TLS、H2 server、双向 control RPC、local
  configuration、HTTP/WebSocket streaming 和两级并发限制已实现。fake edge 在
  1 KiB H2 window 下使用真实 H2 client 与 Cap'n Proto server 验证注册、配置、
  GET、WebSocket 和注销。
- P6：生产 manager 已切换到 H2；Supervisor 使用 core 报告的 reactor 数量，拆分
  lifecycle/control/tunnel/Gateway cancellation，并使用单一绝对 shutdown deadline。
- P7：`quinn`、SOCKS5、QUIC stream framing/schema 和旧 modules 已删除；CI、
  README、provenance 和 license 记录已更新。
- Live gate：真实 Quick Tunnel 已完成两条 H2 connection 注册（不同 connection
  UUID/POP），公网 GET、POST、128 KiB streaming 和 WebSocket 均通过，并在
  deadline 内注销。由于新
  `trycloudflare.com` hostname 有约 30 秒 DNS/route propagation，live test 包含
  有界重试并默认保持 `#[ignore]`。

## 1. 结论

本项目可以在不启动 `cloudflared`、不依赖 Go runtime 的情况下，使用纯
Rust 实现 Cloudflare Quick Tunnel，并将 edge transport 固定为
HTTP/2 over TLS/TCP。

当前项目实际上已经包含一套纯 Rust Quick Tunnel 实现，但它来自
`cloudflare-quick-tunnel 0.3.1` 的本地 fork，使用 QUIC/UDP。需要重写的是
Cloudflare edge transport，不是 Dinotty Gateway、访问密钥或插件 UI。

本次重构采用以下原则：

1. 最终运行时只使用 HTTP/2/TCP，不保留 QUIC fallback。
2. `cloudflared` 源码只作为协议行为基准，不复制或编译 Go 代码。
3. 将已经深度修改的 Rust fork 从 `vendor` 提升为 Dinotty 自有 crate。
4. 只有原样引用的 schema、证书和生成文件继续按第三方资产管理。
5. 先完成结构迁移和协议测试，再切换 transport，避免结构调整与协议调试混在
   同一个变更中。
6. H2 行为以 pin 住的 `cloudflared` commit 为准；当前 Rust fork 中与其冲突的
   行为不能仅以“保持兼容”为由继续保留。

## 2. 已确认的现状

### 2.1 项目层

- `native/src/main.rs` 负责进程生命周期、状态机、控制服务和 Gateway 启动。
- `native/src/tunnel.rs` 是 Supervisor 与 Quick Tunnel crate 之间的适配层。
- `native/src/gateway.rs`、`bridge.rs`、`auth.rs` 构成公网请求进入 Dinotty 前的
  安全边界，HTTP/2 重构不能绕过这层。
- Supervisor 目前直接使用 `QuickTunnelManager`、`QuickTunnelHandle` 和
  `ReactorState`，还直接调用了内部的 `quic_dial::probe_socks5_udp`。后一项属于
  不应跨 crate 暴露的 transport 细节。

### 2.2 当前外部 Rust 代码

`native/vendor/cloudflare-quick-tunnel` 的来源是：

- crate：`cloudflare-quick-tunnel 0.3.1`
- upstream commit：`baeefc821105eb75d1794e3103efe33ee7f26b47`
- 当前本地改动：持久 cancellation、deadline-aware shutdown、reactor events、
  framing/metadata 校验等

这已经不是一个可以直接用上游包覆盖更新的只读 vendor。加入 H2 后，其
`manager`、`rpc`、`proxy` 和 transport 都会发生项目特定重构，因此继续放在
`vendor` 会产生错误的维护预期。

当前大文件也表明需要拆分职责：

| 文件 | 大约大小 | 当前问题 |
|---|---:|---|
| `manager.rs` | 24 KB | public API、启动、HA、重连、shutdown 混在一起 |
| `proxy.rs` | 31 KB | QUIC framing、HTTP/1 parser、连接池、WebSocket 泵送混在一起 |
| `rpc.rs` | 20 KB | schema 编码、QUIC stream、RPC driver 生命周期耦合 |
| `quic_dial.rs` | 16 KB | TLS roots、QUIC、SOCKS5 UDP 和诊断耦合 |

### 2.3 Cloudflare 协议基准

本地参考源码：

- `../cloudflared`
- tag：`2026.7.2`
- commit：`8679787525edc8575b2948a7c4a50b6292c6d426`

已确认的 HTTP/2 模型：

1. 向 `https://api.trycloudflare.com/tunnel` 申请临时 tunnel credentials。
2. 通过 `_v2-origintunneld._tcp.argotunnel.com` SRV 发现 edge。
3. 主动连接 edge 的 TCP 端口，通常是 `7844`。
4. TLS SNI 使用 `h2.cftunnel.com`。
5. TLS 建立后，本地进程在该连接上充当 HTTP/2 server。
6. Cloudflare edge 作为 HTTP/2 client，反向发起 control 和 request streams。
7. `Cf-Cloudflared-Proxy-Connection-Upgrade: control-stream` 标识注册控制流。
8. control request body 与 response body 共同构成 Cap'n Proto RPC 双向字节流。
9. 注册成功后，edge 才开始把公网 HTTP/WebSocket 请求作为新的 H2 streams
   发送过来。

还需要冻结以下容易被普通 HTTP/2 经验误导的 contract：

- TLS client SNI 是 `h2.cftunnel.com`，但与 `cloudflared 2026.7.2` 一致，不设置
  ALPN；不能因为上层协议是 HTTP/2 就自行发送 `h2` ALPN。
- 同一进程内所有 HA connection 和 reconnect 共用一个稳定的 connector/client
  UUID；edge 返回的 connection UUID 则是每次注册独立的值。
- `ConnectionOptions.replaceExisting` 始终为 `false`。注册重试次数通过
  `numPreviousAttempts` 表达，首次为 0，之后按该 connection 的尝试次数递增并
  饱和到 `u8::MAX`。
- connection index 0 注册成功且返回 `tunnelIsRemotelyManaged=false` 时，需要
  调用 `UpdateLocalConfiguration`，不能只完成 `RegisterConnection`。
- 最终宣告给 edge 的 feature list 必须与实际能力一致。初始 H2-only 列表只包含
  `serialized_headers`；不宣告 QUIC、datagram、remote config 或 management 能力
  后再静默忽略对应请求。真实 edge 若要求新增 capability，必须先实现行为和测试
  再加入列表。

当前 vendored schema 与 `cloudflared 2026.7.2` 的三份 schema 文本内容一致；
文件 SHA-256 不同来自 LF/CRLF 换行差异，而不是 schema 字段变化。实现前仍需
把兼容性 pin 更新为明确的 commit，并重新生成或核对 Rust bindings。

## 3. 代码所有权边界

### 3.1 Dinotty 应用代码

保留在 `native/src`：

- CLI 和 JSON command contract
- Supervisor 生命周期和状态文件
- Gateway、认证、session 和访问策略
- Dinotty origin bridge
- 对 tunnel core 的薄适配层

应用层只允许依赖 tunnel core 的稳定 public API，不允许引用 `h2`、Cap'n
Proto generated types、TLS roots 或 edge header constants。

### 3.2 Dinotty tunnel core

将当前本地 fork 提升为项目自有 crate：

```text
native/
  Cargo.toml
  src/
    ...                         # Supervisor 与 Gateway
  crates/
    cloudflare-tunnel-core/
      Cargo.toml
      README.md
      UPSTREAM.md
      THIRD_PARTY_NOTICES.md
      LICENSE-MIT
      LICENSE-APACHE
      src/
        lib.rs
        api.rs
        error.rs
        edge/
          mod.rs
          discovery.rs
          tls.rs
          connector.rs
        protocol/
          mod.rs
          headers.rs
          rpc.rs
          model.rs
          generated/
            tunnelrpc_capnp.rs
        transport/
          mod.rs
          h2/
            mod.rs
            connection.rs
            control.rs
            request.rs
            body.rs
        origin/
          mod.rs
          http1.rs
          websocket.rs
          pool.rs
        runtime/
          mod.rs
          manager.rs
          reactor.rs
          handle.rs
          metrics.rs
      third_party/
        cloudflared/
          VERSION.md
          LICENSE-APACHE
          cf-edge-roots.pem
          schemas/
            tunnelrpc.capnp
            go.capnp
      tests/
        fake_edge.rs
        h2_contract.rs
        live_quick_tunnel.rs
```

建议 package 名使用 `dinotty-cloudflare-tunnel-core`，避免继续表现为上游
`cloudflare-quick-tunnel` crate 的未修改发行版。

自有 crate 表示 Dinotty 负责其 API 和后续维护，不表示可以移除继承代码的许可
信息。crate 继续使用 `MIT OR Apache-2.0`，保留原项目 copyright、双许可证、
upstream commit 和本地修改记录；Dinotty 新增代码可按项目政策授权，但不得让
package metadata 掩盖派生来源。

`native/Cargo.toml` 可以同时保留 Supervisor package 并增加 workspace：

```toml
[workspace]
members = ["crates/cloudflare-tunnel-core"]
resolver = "2"
```

Supervisor 通过 path dependency 使用 core。最终不再保留
`native/vendor/cloudflare-quick-tunnel`。

### 3.3 第三方 Cloudflare 资产

只有以下原始第三方内容进入 `third_party/cloudflared`：

- `tunnelrpc.capnp`
- schema 引用所需的 `go.capnp`
- Cloudflare edge TLS roots
- Apache-2.0 license、来源 commit、原始路径和校验值

预生成的 Rust Cap'n Proto bindings 放在 `src/protocol/generated`，不在
`third_party` 中保留第二份副本。每个生成文件必须记录 schema commit、生成器
版本和生成命令；CI 校验重新生成后无 diff，或校验固定 hash。bindings 属于基于
第三方 schema 的生成资产，其来源和许可仍记录在 `third_party/cloudflared`。

最终 H2-only 版本不再需要 `quic_metadata_protocol.capnp`。应在 QUIC 路径完全
删除后一起移除，而不是在迁移中途删除。

不要把 `../cloudflared` 的 Go 源码复制进本仓库。Rust H2 实现根据协议行为和
测试重新实现；如果某段代码属于逐行翻译，需要在对应 Rust 文件中记录
Cloudflare 源文件和 Apache-2.0 来源。

## 4. 模块职责与依赖规则

| 模块 | 职责 | 不允许承担的职责 |
|---|---|---|
| `api` | Quick Tunnel HTTP API、credentials 解码、API retry | edge 连接和 reactor |
| `edge::discovery` | SRV priority/weight、IP 选择、DNS fallback/cache | TLS 和业务 stream |
| `edge::tls` | roots、SNI、rustls config | H2 request dispatch |
| `edge::connector` | direct TCP 建连和 TLS handshake | 注册和重连策略 |
| `protocol::headers` | Cloudflare internal headers、编码和校验 | 本地 TCP I/O |
| `protocol::rpc` | 通用双向流上的 Cap'n Proto 注册/注销 | QUIC/H2 concrete type |
| `transport::h2` | H2 server connection、stream 分类、flow control | tunnel API 申请 |
| `origin` | 到本地 Gateway 的 HTTP/1.1/WebSocket 转换 | edge discovery |
| `runtime` | start、HA、reactor、retry、shutdown、metrics | header/parser 细节 |

依赖方向固定为：

```text
Supervisor -> core public API
runtime    -> api + edge + transport
transport  -> protocol + origin
edge       -> protocol model/error only
protocol   -> generated bindings
origin     -> local TCP and reusable HTTP/1 helpers
```

不得出现 `protocol -> transport`、`origin -> runtime` 或 Supervisor 直接访问
`transport::*` 的反向依赖。

## 5. Core public API

`lib.rs` 默认不再 `pub mod` 暴露所有内部模块，只导出：

```rust
pub use error::TunnelError;
pub use runtime::{
    QuickTunnelHandle,
    QuickTunnelManager,
    ReactorEvent,
    ReactorState,
    TunnelMetrics,
};
```

建议的 manager 配置：

- local gateway address，而不是只接收 port；production 配置必须验证为 loopback
- HA connection count
- startup/register timeout
- shutdown grace
- cancellation token
- 最大连续 connection attempt 数和 backoff/jitter policy
- test-only service URL、clock、RNG、resolver、connector 和 TLS trust injection

放在 `tests/` 的 Cargo integration tests 编译 library 时没有普通的 `cfg(test)`。
因此测试注入必须使用 crate 内单元测试、非默认 `test-util` feature，或不会进入
长期 public API 的内部 trait/test constructor，不能假设 `#[cfg(test)]` public
方法可被 integration tests 调用。fake TLS edge 必须能注入测试 CA，同时验证生产
构造器始终使用系统 roots 加 pin 住的 Cloudflare roots。

manager 启动一次时生成一个 connector UUID，并把它和 tunnel credentials、tunnel
ID、public URL 一起保存为整个 handle 生命周期内不可变的 registration context。
所有 HA reactor 和 reconnect 必须复用该 context，不能在单次 dial helper 内重新
生成 client UUID。

最终 transport 固定为 HTTP/2，因此不把 `Transport::Http2` 暴露成长期 public
配置。如果迁移阶段需要同时保留 QUIC，只使用 crate-private feature 或测试开关，
不能发布成自动 fallback。

## 6. HTTP/2 transport 设计

### 6.1 Dial

1. API credentials 可复用当前实现；edge discovery 接口可复用，但地址选择逻辑
   必须先修正，不能直接继承当前 `Instant::now().elapsed()` 旋转列表的实现。
2. SRV 选择遵守 priority/weight；同 priority 下随机化，并交错 IPv4/IPv6 候选，
   避免所有 HA reactor 长期钉在同一个首地址。
3. 每个完整 connection attempt 只选择一个随机化 edge 地址；失败后最多重试一次，
   每次 attempt 最长 3.75 秒，同时受 9 秒 native startup deadline 和 10 秒 UI
   总时限约束。
4. 配置 TCP keepalive 和 connect/handshake timeout。
5. 在 TCP stream 上执行 rustls client handshake，SNI 为 `h2.cftunnel.com`，
   roots 为系统 trust store 加 pin 住的 Cloudflare edge roots，ALPN 列表为空。
7. 使用 `h2::server::handshake`，因为本地是 H2 server 角色。
8. connection driver 必须持续被 poll，负责 PING、WINDOW_UPDATE、GOAWAY 和
   stream frame 处理。
9. H2 builder 必须设置明确的并发 stream、header list 和 window 上限；这些值
   作为 protocol constants 记录并接受小 window 测试，不能依赖库默认值漂移。
10. startup deadline 覆盖 Quick Tunnel API、discovery、所有候选 dial、TLS、H2、
    control stream 到达和 `RegisterConnection` 完成；每次 reconnect attempt 也有
    独立的完整 deadline。H2 handshake 后等待 control stream 不能无限期挂起。
11. 明确区分“响应 edge 发来的 PING”和“主动 liveness probe”。Connected 状态必须
    有经过 fake/live edge 验证的 H2 PING/ACK watchdog，或有跨平台、可测试且给出
    最大故障发现时间的 TCP keepalive 策略；不能依赖操作系统默认 keepalive。

### 6.2 Control stream

control handler 必须：

1. 验证 internal upgrade header 和 H2 stream 状态。method/path 只校验 P2 fixture
   已证明稳定的部分，不能添加 `cloudflared` 基准中不存在的过度限制。
2. 一条 edge connection 只允许一个 control stream；并发到达时使用原子状态转换
   保证只有一个 handler 获胜，其余 stream 明确 reset 或返回错误。
3. 发送不带 `END_STREAM` 的 `200` response；之后 RPC 写入 response DATA，RPC
   正常关闭时才发送 `END_STREAM`。
4. 把 H2 `RecvStream` 和 `SendStream` 适配为 Cap'n Proto RPC 所需的
   `AsyncRead`/`AsyncWrite`。
5. reader 每消费一段 DATA 都释放 receive capacity；writer 正确实现
   `reserve_capacity`/`poll_capacity`、partial write、flush、reset 和 END_STREAM，
   不能在 H2 window 不足时谎报字节已写入。
6. 使用 registration context 中稳定的 connector UUID、`TunnelAuth`、tunnel UUID、
   connection index 和 `ConnectionOptions` 发起 `RegisterConnection`。
7. `replaceExisting=false`；`numPreviousAttempts` 为当前 conn index 在本次注册前已经
   消耗的完整 connection attempts 数，包含 discovery、TCP、TLS、等待 control 和
   register 失败，不只统计真正发出的注册 RPC；
   `originLocalIp` 来自 edge TCP socket 的本地 IP，不是 Gateway 地址。
8. 注册成功后立即通过 oneshot 把 location、edge 返回的 connection UUID 和
   readiness 通知 reactor。
9. 如果 connection index 为 0 且结果表明 tunnel 非 remotely-managed，随后在独立
   timeout 内调用 `UpdateLocalConfiguration`，发送只指向本地 Gateway 的最小
   ingress 配置。P2 必须从 pin 住的 `cloudflared --url` 行为建立 golden fixture，
   冻结 `ingress`、`warp-routing`、可选 `__configuration_flags`、hostname/catch-all、
   service URL 和 IPv6 loopback 的 JSON 形状。配置不得包含访问密钥、session 或
   Dinotty 实际 origin。与 `cloudflared` 一致，该 best-effort 调用失败只记录
   metric/log，不撤销已经成功的 registration readiness。
10. `200` response headers 发出后的注册/RPC 错误只能 reset control stream 并触发
    reconnect，不能再伪造 `502` response；错误发生在发送 headers 之前才可返回
    HTTP error。
11. shutdown 时在全局 deadline 内发 `UnregisterConnection`；control stream 或
    connection driver 异常都必须触发 reactor reconnect。

Cap'n Proto RPC 当前依赖 `LocalSet`/专用线程来处理 `!Send` 状态。重构时应保留
这个隔离，但输入改成通用 reader/writer，不能让 `rpc.rs` 再依赖 `quinn` 或
`h2`。fake edge 必须在真实 H2 DATA 上运行 Cap'n Proto server，不能只 mock
Rust 的 `RegisterConnection` 方法，否则无法验证 bootstrap、双向 flow control、
关闭和 framing。

### 6.3 Request streams

stream 分类顺序与 `cloudflared` 一致：

1. configuration update
2. WebSocket upgrade
3. TCP proxy marker
4. control stream
5. normal HTTP

Quick Tunnel core 的处理范围：

- normal HTTP：支持
- WebSocket：支持
- configuration update：只有宣告 `allow_remote_config` 时才接受；必须限制 body
  大小、完整消费并解析 `{version, config}`，返回兼容的
  `{lastAppliedVersion, err}`。任何情况下都不得改变 Gateway 安全策略
- TCP/WARP：明确返回不支持
- UDP/ICMP：不实现

P2 必须冻结最终 feature list。初始 H2-only 列表为 `serialized_headers`，不得宣告
`allow_remote_config`、`support_datagram_v2`、`support_quic_eof` 或没有实现的
management 能力。意外收到的 configuration stream 要在有限读取/丢弃 body 后
返回明确错误或 reset，并记录可观测的协议错误，不能成功 no-op。这里的
`UpdateLocalConfiguration` 是注册后把本地 ingress 摘要发送给 edge，不代表允许
edge 远程改变 Gateway 配置。

### 6.4 HTTP 和 WebSocket bridge

- H2 request 的 method、URI、authority 和 headers 转换成本地 HTTP/1.1 请求。
- 本地连接目标始终是绑定在 loopback 的 Rust Gateway。
- `:authority` 是本地 HTTP/1.1 `Host` 的唯一规范来源；若同时存在的 `Host` 与
  authority 不一致，或 authority 不是当前 Quick Tunnel hostname，则在 core 层
  拒绝，不能任选其一继续转发。
- normal HTTP 删除 hop-by-hop 和 Cloudflare internal headers；保留 Gateway 做
  登录限速和审计所需的 `CF-Connecting-IP`、`CF-Ray` 等 edge 生成 header，现有
  `bridge.rs` 继续作为进入 Dinotty origin 前的最后一道安全过滤。
- WebSocket 是例外：向本地 Gateway 的 HTTP/1.1 请求必须合成
  `Connection: Upgrade` 和 `Upgrade: websocket`，并保留所需的
  `Sec-WebSocket-*` 与公网 `Origin`。这些 header 必须先让 Axum 完成 upgrade，
  不能套用 normal HTTP 的 hop-by-hop 删除规则。
- request/response body 必须流式传输，不能整包缓存。
- 每次读取 H2 DATA 后及时释放 flow-control capacity；向 edge 写 DATA 时必须等待
  send capacity，request、response 和 control stream 使用相同的背压原则。
- origin response headers 按 Cloudflare serialized-header 规则返回。
- origin `101 Switching Protocols` 在 H2 层映射为 `200`，随后保持两个方向同时
  泵送，任一方向结束时正确半关闭。
- 在 response headers 尚未发送时发生错误，返回 `502` 和 Cloudflare response
  meta；headers 已发送后只能 reset stream，不能伪造第二个响应。
- transport 层使用每 connection 与全局两级 semaphore 限制 handler 数量。超过
  上限时返回明确的 overload 响应或 `RST_STREAM(REFUSED_STREAM)`，不能先创建
  无界 task 再依赖 Gateway 的并发限制兜底。

H2 到本地 HTTP/1.1 的 framing contract 必须在 P2 冻结：

- 单一合法 `Content-Length` 必须与收到的 DATA 总长度完全一致；重复、冲突、溢出
  或提前 EOF 都失败关闭该 origin connection。
- 未知长度的 request body 使用合法的 H1 chunked framing，并发送终止 chunk；H2
  `Transfer-Encoding` 非法，`TE` 只允许 `trailers`。
- HEAD、1xx、204 和 304 response 按 HTTP 语义视为无 body；101 只用于 WebSocket
  upgrade 并映射为 H2 200。
- chunked origin response 解码成 H2 DATA，不能向 H2 转发 `Transfer-Encoding`；
  close-delimited response 不得归还连接池。
- 明确 request/response trailers、`Expect: 100-continue` 和非 101 interim response
  的支持或拒绝策略。任何 parser/framing 错误都不得复用 origin connection。
- 优先使用成熟 HTTP/1 client codec；如果继续维护手写 parser，上述每个分支必须有
  fixture 和 fragmentation 测试，输入需要覆盖任意 TCP 分片边界。

## 7. Runtime、HA 和状态语义

一次 H2 reactor cycle 的状态顺序：

```text
Discovering
  -> Connecting TCP
  -> TLS ready
  -> H2 ready
  -> Waiting for control stream
  -> Registering
  -> Connected
  -> Draining or ConnectionLost
```

只有 `RegisterConnection` 成功后才能发送 `ReactorState::Connected`。conn 0 的
`UpdateLocalConfiguration` 是注册后的 best-effort 调用，不阻塞 readiness；TLS/H2
handshake 成功不能被当作 tunnel ready。

目标 runtime 行为：

- 每条 HA connection 使用独立 connection index。
- 同一 manager 生命周期的所有 HA connection 和 reconnect 复用稳定的 connector
  UUID、tunnel ID、credentials 和 URL。
- 首次和重连注册都使用 `replace_existing=false`；首次
  `num_previous_attempts=0`。每个 conn index 的完整 connection attempt 失败后递增，
  传输时饱和到 `u8::MAX`，成功注册后重置连续失败预算。
- 唯一一次重试使用 1 秒加有界 jitter 的退避，避免多个 HA reactor 同步重连。
- 重连必须复用同一个 tunnel ID 和 URL。
- 产品默认最多执行 2 次完整 connection attempt（首次加 1 次重试）；这是与
  `cloudflared` retry-forever 行为的有意差异。整个首次启动由 9 秒 native deadline
  和 10 秒 UI 总时限约束，Quick Tunnel API 的瞬态失败同样最多重试 1 次。
  discovery、TCP、TLS、等待 control、register 和 connection-level permanent failure
  的计数/分类必须由统一 attempt state machine 处理。明确的 permanent registration
  error 立即耗尽当前 reactor，普通失败在成功注册后清零。
- core 必须向 Supervisor 暴露实际启动的 reactor 数量或聚合状态。只有全部实际
  reactor 耗尽预算后 Supervisor 才进入 `error`，不得在应用层硬编码 `2`；HA=1、
  HA=2、部分耗尽和全部耗尽都要测试。
- `streams_total`、`bytes_in`、`bytes_out`、`reconnects` 继续对 Supervisor 可见。

当前 Dinotty 使用 2 条 HA connection，而 `cloudflared` 的 Quick Tunnel 默认值是
1。这是有意的产品偏离，不作为协议基准事实。P6 切换生产 manager 前必须通过
真实 edge 验证 2 条 H2 connection 能稳定注册、不会重复路由或触发限流；验证失败
则把 Quick Tunnel 默认值改为 1，同时保留内部可配置能力。

shutdown 顺序：

1. 计算唯一的绝对 shutdown deadline，状态切换为 `Draining`。
2. 立即调用 H2 graceful shutdown/发送第一阶段 GOAWAY，通知 edge 不再创建新
   streams；connection driver 继续被 poll，以服务已接受 streams 和 control RPC。
3. 为 `UnregisterConnection` 预留独立子预算并开始注销；同时等待已接受的
   HTTP/WebSocket tasks 排空。control stream 不计入等待注销前完成的 task 集合。
4. tasks 和 unregister 都完成后结束 control response body，并完成 H2 graceful
   shutdown。
5. 到绝对 deadline 后 reset 剩余 streams、关闭 H2/TLS/TCP，不再叠加第二个完整
   grace period。
6. 撤销 Gateway sessions 并更新状态文件。

当前 Supervisor 把同一个 cancellation token 同时交给 Gateway、control server 和
tunnel manager，并在 `handle.shutdown_with` 之前撤销 sessions。P6 必须拆分“收到
shutdown 请求”“停止接受 control 请求”“tunnel graceful drain”“Gateway stop”和
“强制关闭”信号。外部 token 只能触发一次有序协调，不能让所有组件在 Supervisor
写入 `Draining` 前自行并发退出。shutdown API 优先接收绝对 `Instant`；若保留
`Duration`，也必须只在最外层转换一次，所有子步骤共享同一 deadline。

## 8. 分阶段实施

### P0：保存可回退基线（已完成）

当前 Git 分支尚无 commit，所有项目文件均为 untracked。大规模移动前应先建立
一个用户确认的 baseline commit 或等价快照，否则无法可靠区分原始代码、结构
迁移和协议实现。

Gate：

- vendored crate tests：28 passed，2 ignored
- native Supervisor tests：9 passed
- TypeScript check/build 通过

P1A 前 vendored crate 还不是 workspace member，因此前两项必须分别运行
`cargo test --manifest-path native/vendor/cloudflare-quick-tunnel/Cargo.toml` 和
`cargo test --manifest-path native/Cargo.toml`，不能只运行后者的 `--workspace` 就
误以为覆盖了 vendor tests。

### P1A：原样迁移 crate，不改变行为（已完成）

- 将 fork 移到 `native/crates/cloudflare-tunnel-core`。
- 建立 Cargo workspace 和新的 package/lib 名。
- 只做必要的 crate/package/import 重命名，不在同一提交拆分大文件。
- 移动 `LICENSE-MIT`、`LICENSE-APACHE`、UPSTREAM 和 notices，不丢失来源信息；
  package metadata 继续声明 `MIT OR Apache-2.0`。
- `native/src/tunnel.rs` 只调用 public manager/diagnostics API。

Gate：全部原测试不变通过，live QUIC smoke 可选通过。

### P1B：模块拆分和基线修复，生产 transport 仍为 QUIC（已完成）

- 按第 3、4 节边界拆分 `manager`、`proxy`、`rpc` 和 diagnostics。
- 将 connector UUID 和 registration context 提升到 manager 生命周期，但先加入
  characterization tests，避免在 H2 实现阶段才发现旧行为漂移。
- 修正 discovery 的 SRV priority/weight、候选随机化和 IPv4/IPv6 交错；不改变
  生产 transport 仍为 QUIC 的事实。
- 任何必要的行为修复独立提交，并在变更记录中说明为什么不继续兼容 fork 的旧
  行为。

Gate：全部原测试通过；新增稳定 connector ID、SRV 选择和 public API 边界测试。

### P2：冻结 H2 contract（已完成）

- 新增 `PROTOCOL_COMPATIBILITY.md` 或更新 `UPSTREAM.md`，pin
  `cloudflared 2026.7.2` commit。
- 对 schema 和证书做机械 diff，记录 SHA-256。
- 冻结 TLS SNI、空 ALPN、trust roots、H2 SETTINGS 和 error/reset 行为。
- 冻结 H2-only feature list、稳定 connector ID、`replaceExisting=false`、
  `numPreviousAttempts`、`originLocalIp`、local configuration RPC 和 configuration
  update 策略。
- 为 header encoding、authority/Host 校验、request classification、response meta、
  WebSocket upgrade、H1 framing、local configuration JSON 和 RPC 参数建立 fixture
  tests。
- 建立 in-memory fake H2 edge harness；fake edge 使用真实 H2 client 和 Cap'n Proto
  server，不 mock 掉 wire protocol。P2 gate 要求 harness、test trust、deterministic
  clock/RNG 和 fixtures 可编译；依赖尚未实现 transport 的端到端测试从 P3/P4 开始
  转绿，不把预期失败测试作为 P2 的绿色 gate。

Gate：协议测试不需要真实 Cloudflare 即可运行。

### P3：TCP/TLS/H2 dial（已完成）

- 实现 direct TCP connector。
- 实现带候选级和总 deadline 的 edge dial。
- 实现 `h2.cftunnel.com`、空 ALPN 和 pin roots 的 TLS config。
- 实现带明确 SETTINGS、stream limits 和 graceful GOAWAY 的 H2 server handshake
  与 connection driver。

Gate：对 fake edge 完成 TLS/H2 handshake；opt-in live test 能连接真实 edge。

### P4：control stream 和注册（已完成）

- 将 RPC driver 泛化到任意双向流。
- 实现 RecvStream/SendStream adapter 的完整 flow control、partial write、flush 和
  END_STREAM 语义。
- 处理 H2 control stream、注册结果、conn 0 local configuration 和注销。
- 将 registration readiness 接入 reactor。

Gate：fake edge 在小 H2 window 下完成真实 Cap'n Proto 注册、local configuration
和注销，并验证 local configuration 失败不撤销 readiness；真实 Quick Tunnel 能
返回 location，公网请求不再是 530。

### P5：HTTP/WebSocket request proxy（已完成）

- 实现普通 HTTP request/response streaming。
- 实现 serialized response headers 和 error meta。
- 实现 normal HTTP header 清理以及 WebSocket 到 Gateway 的 HTTP/1.1 upgrade
  header 合成和双向流。
- 加入 authority/Host、flow-control、并发上限、取消、RST_STREAM、GOAWAY 和
  origin failure 测试。

Gate：fake edge 与真实 Quick Tunnel 的 GET、POST、长响应和 WebSocket 均通过；
WebSocket 测试必须穿过真实 Rust Gateway，而不只是连接一个 echo origin。

### P6：manager 切换和 Supervisor 接入（已完成）

- production manager 改为 H2 reactor。
- 更新错误文案、metrics 和 README。
- 保持 Gateway/security contract 不变。
- 删除 Supervisor 对 HA 数量的硬编码，使用 core 报告的实际 reactor 数量/聚合状态；
  覆盖 HA=1 和 HA=2 exhaustion。
- 拆分共享 cancellation token，按第 7 节的单一绝对 deadline 编排 Draining、GOAWAY、
  unregister、request drain、Gateway/session shutdown。
- 验证 HA=2 的真实 edge 支持；失败时将 Quick Tunnel 默认值降为 1。
- 验证稳定 connector ID、同 URL 重连、全部 reactor exhausted 和单 deadline
  graceful shutdown。

Gate：插件端到端运行，网络抖动后仍使用原 URL 恢复。

### P7：删除 QUIC 和收尾（已完成）

- 删除 `quinn`、SOCKS5、UDP ASSOCIATE 路径和 QUIC modules，并删除相关依赖。
- 删除 `quic_metadata_protocol.capnp` 及生成 bindings。
- 清理 feature flags 和迁移期 adapter。
- 完成跨平台 build/check、license audit 和文档更新。

Gate：dependency tree 中没有 QUIC runtime；不创建 UDP tunnel socket。

## 9. 测试矩阵

### 单元测试

- Quick Tunnel API 成功、4xx、5xx retry、非 JSON 和 business error
- SRV priority/weight、真实随机化、IPv4/IPv6 交错、缓存和 DoT fallback
- roots、SNI、空 ALPN、无效证书和 handshake timeout
- Cloudflare header 编码、重复 header、非法 CR/LF 和大小限制
- request 分类、authority/Host 冲突和不支持的 TCP/config stream
- H2-only feature list；不包含 QUIC/datagram/未实现 management capability
- 稳定 connector ID；HA/reconnect 不重新生成；edge connection UUID 独立
- Cap'n Proto register/local-configuration/unregister 参数；`replaceExisting=false`；
  `numPreviousAttempts` 递增并饱和
- retry/backoff、state events 和 metrics

### 模拟 edge 集成测试

- edge 发起 control stream，Rust 返回 200 并完成 RPC 注册
- 注册失败、重复 control stream、control 提前关闭
- 小 control window 下双向 RPC 不死锁；正常完成时才发送 END_STREAM
- 多个并发 HTTP streams
- 超过 H2/全局并发上限时有界拒绝，不创建无界 tasks
- Content-Length、chunked origin、无 body、提前 EOF
- 未知长度 request 的 H1 chunked 编码、request DATA/Content-Length 不一致
- HEAD、1xx、204、304、close-delimited response 和非 101 interim response
- 重复/冲突 Content-Length、非法 Transfer-Encoding/TE、trailers 策略和 TCP 任意分片
- 大文件双向流和 H2 window exhaustion
- WebSocket 经真实 Gateway 完成 upgrade 和双向消息；normal HTTP 不携带
  hop-by-hop headers
- configuration body 大小限制和兼容 response；未宣告 capability 时明确拒绝
- RST_STREAM、GOAWAY、TCP reset、graceful drain
- H2 ready 后不发送 control stream、半开 TCP、PING ACK timeout
- shutdown 一开始即拒绝新 stream；长 WebSocket 不挤占 unregister 预留预算；总
  耗时不超过单一 grace deadline 加调度余量

### 真实 opt-in 测试

通过环境变量启用，避免 CI 默认申请公网 tunnel：

- Quick Tunnel API + H2 register
- 验证 TLS 使用预期 SNI 且不依赖 `h2` ALPN
- 公网认证拒绝和授权访问
- GET/POST/streaming/WebSocket
- 两条 HA connection 注册与路由稳定；若 edge 不支持则记录结果并使用默认 1 条
- 强制断开一条 reactor 后以同 connector ID、tunnel ID 和 URL 恢复
- shutdown 后注销并退出
- HA=1 时唯一 reactor exhausted 会进入 error；HA=2 时单腿 exhausted 只进入 degraded
  状态或保持可用，全部 exhausted 才进入 error

### 全仓库验证

```powershell
cargo fmt --manifest-path native/Cargo.toml --all -- --check
cargo test --manifest-path native/Cargo.toml --workspace
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets -- -D warnings
npm run check
npm run build
```

随后验证 release targets：Windows x86_64、Linux x86_64/aarch64、macOS
x86_64/aarch64。

## 10. 验收标准

- 最终二进制不包含、下载或启动 `cloudflared`。
- 不依赖 Go runtime。
- edge transport 仅使用 direct TCP/TLS/HTTP2；不要求 UDP，但要求 outbound TCP/7844。
- Quick Tunnel URL 支持 GET、POST、流式响应和 WebSocket。
- 所有公网请求仍先经过 Rust Gateway。
- 未认证请求不能连接 Dinotty origin。
- edge 断线后使用相同 connector ID、tunnel ID 和 URL 自动重连；注册参数保持
  `replaceExisting=false`，并准确报告 previous attempts。
- HA、metrics、reactor exhaustion 和 shutdown 状态准确。
- shutdown 进入 draining 时立即发送 GOAWAY，在单一 deadline 内排空、注销并
  强制关闭剩余 streams。
- direct TCP 网络路径错误可诊断。
- H2 connection、control RPC 和 request handlers 都有明确的 flow-control 与资源
  上限，压力测试下不产生无界 task 或 buffer。
- 第三方 schema、证书、生成代码都有来源、license、commit 和 hash 记录。
- 派生 crate 保留原项目双许可证、copyright 和 upstream provenance。
- 所有单元/集成测试和目标平台构建通过。

## 11. 明确不做的范围

- Cloudflare Named Tunnel
- Cloudflare account/token 管理
- WARP、TCP routing、UDP、ICMP 和 datagram v2/v3
- Argo Smart Routing
- Cloudflare 远程配置（尤其是改变本地 Gateway、安全策略或 origin routing）
- 把 `cloudflared` Go 源码作为子模块或编译依赖
- QUIC 与 HTTP/2 的运行时自动 fallback

## 12. 主要风险

| 风险 | 缓解措施 |
|---|---|
| H2 角色与常见客户端模型相反 | 使用 `h2::server`，fake edge 使用 `h2::client` 固化模型 |
| 普通 H2 实现会自然设置 `h2` ALPN | contract 明确空 ALPN，并用 fake/live TLS 测试固定 |
| control stream 是双向长流 | 单独 adapter 和 RPC driver lifecycle 测试 |
| H2 flow control 导致 request 或 RPC 挂死 | 读侧 release、写侧 reserve/poll capacity，并做小 window 压力测试 |
| WebSocket header 被 normal HTTP 清理规则删除 | 对 Gateway 合成 H1 upgrade，端到端验证 101 -> H2 200 + 双向 body stream |
| 重连误用 replaceExisting 或更换 client ID | 稳定 registration context 和 RPC fixture tests |
| 宣告未实现的 edge capability | P2 冻结最小 feature list，每项 capability 都有行为测试 |
| shutdown drain 与 unregister 互相耗尽预算 | 立即 GOAWAY、单一绝对 deadline、预留 unregister 子预算 |
| edge stream 洪峰耗尽内存或连接 | H2 SETTINGS、两级 semaphore、header/body limits 和 overload 测试 |
| 大规模重构丢失现有安全修复 | P1A 只移动；P1B 拆分与基线修复分提交并保留 characterization tests |
| 外部代码来源变得模糊 | 自有 crate 与 `third_party` 资产分层，双重 upstream pin |
| Cloudflare 未公开协议变化 | pin 版本、contract fixtures、opt-in live smoke 和明确错误 |

## 13. 实施前需要保持的假设

- 最终只交付 HTTP/2 transport。
- Dinotty 暂以 HA=2 为目标，但承认 `cloudflared` Quick Tunnel 默认是 1；只有真实
  H2 Quick Tunnel 测试证明两条连接稳定后才保留默认 2，否则改为 1。
- 不支持上游代理；Quick Tunnel API 和 edge transport 都直接连接。
- Gateway 的 host/origin/session 规则不因 transport 重构而放宽。
- 最终 H2 feature list 初始只宣告 `serialized_headers`；以后只有先实现并测试完整
  行为才能增加 capability，不支持 `allow_remote_config`。
- H2 TLS 与基准版本一致使用 `h2.cftunnel.com` SNI 和空 ALPN。
- 在结构迁移前先保存 Git baseline；本计划本身不创建 commit。
