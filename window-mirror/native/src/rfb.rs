//! An RFB (VNC) server that speaks over WebSocket, serving one captured window.
//!
//! WebSocket rather than TCP because that is the only shape dinotty can carry:
//! `/preview/<port>/` reverse-proxies a loopback port, forwards binary frames
//! and passes the subprotocol through, so a viewer on a phone reaches this
//! through dinotty's own authentication and tunnel. Nothing here is reachable
//! from outside the machine on its own.
//!
//! Only the Raw encoding is implemented, over a dirty-tile diff. Raw is
//! verbose, but it is the one encoding every RFB client must support, and for a
//! mostly-static window it is the diff, not the encoding, that decides the
//! bandwidth.

use std::sync::{Arc, Mutex};

use anyhow::{anyhow, bail, Context as _, Result};
use flate2::{Compress, Compression, FlushCompress};
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

use crate::capture::{Frame, Latest};
use crate::input::Injector;

/// The injector is shared by every viewer of a window: two phones pointing at
/// the same mirror drive one cursor, which is what a mirror means. `None` is a
/// hard read-only server, distinct from a client that merely chose not to send.
pub type SharedInjector = Option<Arc<Mutex<Injector>>>;

/// Diff granularity. 64-pixel squares are small enough that a blinking caret
/// costs one tile, and large enough that a full-frame diff stays a handful of
/// linear passes.
const TILE: u32 = 64;

/// Rows go out in chunks of roughly this size, so a full 2560x1552 update does
/// not build a 16 MB buffer to hand to the socket.
const CHUNK_BYTES: usize = 256 * 1024;

const ENCODING_RAW: i32 = 0;
const ENCODING_ZLIB: i32 = 6;
const ENCODING_DESKTOP_SIZE: i32 = -223;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PixelFormat {
    pub bpp: u8,
    pub depth: u8,
    pub big_endian: bool,
    pub true_colour: bool,
    pub r_max: u16,
    pub g_max: u16,
    pub b_max: u16,
    pub r_shift: u8,
    pub g_shift: u8,
    pub b_shift: u8,
}

impl PixelFormat {
    /// What the capture already produces: packed RGBA bytes, which read as a
    /// little-endian 32-bit pixel with red in the low byte.
    const NATIVE: Self = Self {
        bpp: 32,
        depth: 24,
        big_endian: false,
        true_colour: true,
        r_max: 255,
        g_max: 255,
        b_max: 255,
        r_shift: 0,
        g_shift: 8,
        b_shift: 16,
    };

    fn write(self, out: &mut Vec<u8>) {
        out.push(self.bpp);
        out.push(self.depth);
        out.push(u8::from(self.big_endian));
        out.push(u8::from(self.true_colour));
        out.extend_from_slice(&self.r_max.to_be_bytes());
        out.extend_from_slice(&self.g_max.to_be_bytes());
        out.extend_from_slice(&self.b_max.to_be_bytes());
        out.push(self.r_shift);
        out.push(self.g_shift);
        out.push(self.b_shift);
        out.extend_from_slice(&[0, 0, 0]);
    }

    fn parse(b: &[u8]) -> Self {
        Self {
            bpp: b[0],
            depth: b[1],
            big_endian: b[2] != 0,
            true_colour: b[3] != 0,
            r_max: u16::from_be_bytes([b[4], b[5]]),
            g_max: u16::from_be_bytes([b[6], b[7]]),
            b_max: u16::from_be_bytes([b[8], b[9]]),
            r_shift: b[10],
            g_shift: b[11],
            b_shift: b[12],
        }
    }

    /// Whether a NATIVE frame needs its red and blue channels swapped to
    /// satisfy this format. Anything further from native is refused rather than
    /// silently rendered wrong.
    fn swap_rb(self) -> Result<bool> {
        if self.bpp != 32 || !self.true_colour || self.big_endian {
            bail!("unsupported pixel format: {self:?}");
        }
        if (self.r_max, self.g_max, self.b_max) != (255, 255, 255) {
            bail!("unsupported colour maxima: {self:?}");
        }
        match (self.r_shift, self.g_shift, self.b_shift) {
            (0, 8, 16) => Ok(false),
            (16, 8, 0) => Ok(true),
            _ => bail!("unsupported channel order: {self:?}"),
        }
    }
}

#[derive(Debug)]
pub enum ClientMsg {
    SetPixelFormat(PixelFormat),
    SetEncodings(Vec<i32>),
    FbUpdateRequest { incremental: bool },
    Key { down: bool, keysym: u32 },
    Pointer { mask: u8, x: u16, y: u16 },
    CutText(String),
}

/// Parse one client message, returning it with the number of bytes consumed.
/// `None` means the buffer does not hold a whole message yet.
fn parse_client_msg(b: &[u8]) -> Result<Option<(ClientMsg, usize)>> {
    let Some(&kind) = b.first() else { return Ok(None) };
    let have = |n: usize| -> bool { b.len() >= n };
    match kind {
        0 => {
            if !have(20) {
                return Ok(None);
            }
            Ok(Some((ClientMsg::SetPixelFormat(PixelFormat::parse(&b[4..20])), 20)))
        }
        2 => {
            if !have(4) {
                return Ok(None);
            }
            let count = usize::from(u16::from_be_bytes([b[2], b[3]]));
            let total = 4 + count * 4;
            if !have(total) {
                return Ok(None);
            }
            let encodings = b[4..total]
                .chunks_exact(4)
                .map(|c| i32::from_be_bytes([c[0], c[1], c[2], c[3]]))
                .collect();
            Ok(Some((ClientMsg::SetEncodings(encodings), total)))
        }
        3 => {
            if !have(10) {
                return Ok(None);
            }
            Ok(Some((ClientMsg::FbUpdateRequest { incremental: b[1] != 0 }, 10)))
        }
        4 => {
            if !have(8) {
                return Ok(None);
            }
            let keysym = u32::from_be_bytes([b[4], b[5], b[6], b[7]]);
            Ok(Some((ClientMsg::Key { down: b[1] != 0, keysym }, 8)))
        }
        5 => {
            if !have(6) {
                return Ok(None);
            }
            let x = u16::from_be_bytes([b[2], b[3]]);
            let y = u16::from_be_bytes([b[4], b[5]]);
            Ok(Some((ClientMsg::Pointer { mask: b[1], x, y }, 6)))
        }
        6 => {
            if !have(8) {
                return Ok(None);
            }
            let len = u32::from_be_bytes([b[4], b[5], b[6], b[7]]) as usize;
            let total = 8 + len;
            if !have(total) {
                return Ok(None);
            }
            let text = String::from_utf8_lossy(&b[8..total]).into_owned();
            Ok(Some((ClientMsg::CutText(text), total)))
        }
        other => Err(anyhow!("unknown client message type {other}")),
    }
}

/// A WebSocket carrying an RFB byte stream. RFB has no framing of its own, so
/// payloads are concatenated and re-split wherever the protocol says.
struct Stream {
    ws: WebSocketStream<TcpStream>,
    buf: Vec<u8>,
    pos: usize,
}

impl Stream {
    fn new(ws: WebSocketStream<TcpStream>) -> Self {
        Self { ws, buf: Vec::new(), pos: 0 }
    }

    async fn fill(&mut self) -> Result<()> {
        loop {
            let Some(msg) = self.ws.next().await else { bail!("client disconnected") };
            match msg? {
                Message::Binary(data) => {
                    self.buf.drain(..self.pos);
                    self.pos = 0;
                    self.buf.extend_from_slice(&data);
                    return Ok(());
                }
                Message::Text(text) => {
                    self.buf.drain(..self.pos);
                    self.pos = 0;
                    self.buf.extend_from_slice(text.as_bytes());
                    return Ok(());
                }
                Message::Close(_) => bail!("client closed the connection"),
                _ => {}
            }
        }
    }

    async fn read_exact(&mut self, n: usize) -> Result<Vec<u8>> {
        while self.buf.len() - self.pos < n {
            self.fill().await?;
        }
        let out = self.buf[self.pos..self.pos + n].to_vec();
        self.pos += n;
        Ok(out)
    }

    async fn write(&mut self, data: Vec<u8>) -> Result<()> {
        self.ws.send(Message::Binary(data)).await?;
        Ok(())
    }
}

/// RFB 3.8 handshake, security type None.
///
/// No VNC password: this listener is bound to loopback and is only reachable
/// through dinotty's proxy, which has already authenticated the caller. A
/// second password here would be a second secret to leak, not a second lock.
async fn handshake(stream: &mut Stream, width: u16, height: u16, name: &str) -> Result<()> {
    stream.write(b"RFB 003.008\n".to_vec()).await?;
    let version = stream.read_exact(12).await?;
    if !version.starts_with(b"RFB 003.") {
        bail!("unexpected client version {:?}", String::from_utf8_lossy(&version));
    }

    stream.write(vec![1, 1]).await?; // one security type on offer: None
    let chosen = stream.read_exact(1).await?;
    if chosen[0] != 1 {
        stream.write(vec![0, 0, 0, 1]).await?;
        bail!("client asked for security type {}, only None is offered", chosen[0]);
    }
    stream.write(vec![0, 0, 0, 0]).await?; // SecurityResult: OK

    let _shared = stream.read_exact(1).await?;

    let name_bytes = name.as_bytes();
    let mut init = Vec::with_capacity(24 + name_bytes.len());
    init.extend_from_slice(&width.to_be_bytes());
    init.extend_from_slice(&height.to_be_bytes());
    PixelFormat::NATIVE.write(&mut init);
    init.extend_from_slice(&u32::try_from(name_bytes.len())?.to_be_bytes());
    init.extend_from_slice(name_bytes);
    stream.write(init).await?;
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

/// Tiles that differ between `prev` and `cur`, merged along each tile row.
///
/// The merge matters more than it looks: a caret crossing a line of text
/// dirties a run of tiles, and one wide rect costs one 12-byte header instead
/// of one per tile.
pub fn dirty_rects(prev: &[u8], cur: &[u8], width: u32, height: u32) -> Vec<Rect> {
    let stride = width as usize * 4;
    let mut rects = Vec::new();
    let mut y = 0;
    while y < height {
        let h = TILE.min(height - y);
        let mut run: Option<Rect> = None;
        let mut x = 0;
        while x < width {
            let w = TILE.min(width - x);
            let changed = (0..h).any(|row| {
                let start = (y + row) as usize * stride + x as usize * 4;
                let end = start + w as usize * 4;
                prev[start..end] != cur[start..end]
            });
            if changed {
                run = Some(match run {
                    Some(r) => Rect { w: r.w + w, ..r },
                    None => Rect { x, y, w, h },
                });
            } else if let Some(r) = run.take() {
                rects.push(r);
            }
            x += TILE;
        }
        if let Some(r) = run.take() {
            rects.push(r);
        }
        y += TILE;
    }
    rects
}

struct View {
    prev: Vec<u8>,
    width: u32,
    height: u32,
    have_prev: bool,
    swap_rb: bool,
    desktop_size: bool,
    encoding: i32,
    /// One zlib stream for the whole connection, never reset: its dictionary
    /// carrying across rects is most of why this encoding is worth having.
    zlib: Compress,
}

/// Feed bytes into the connection's zlib stream.
///
/// `compress_vec` writes into the spare capacity of `out` and stops when either
/// the input is consumed or that capacity runs out, so it has to be driven in a
/// loop with room made each time round.
fn deflate(z: &mut Compress, input: &[u8], out: &mut Vec<u8>, flush: FlushCompress) -> Result<()> {
    let mut offset = 0;
    loop {
        if out.capacity() - out.len() < 4096 {
            out.reserve(64 * 1024);
        }
        let spare = out.capacity() - out.len();
        let consumed_before = z.total_in();
        let produced_before = z.total_out();
        z.compress_vec(&input[offset..], out, flush)?;
        offset += usize::try_from(z.total_in() - consumed_before)?;
        let produced = usize::try_from(z.total_out() - produced_before)?;
        // Done once the input is gone and zlib stopped short of filling the
        // room it was given, which is how it says it has nothing pending.
        // "Produced nothing" is NOT the test: a sync flush emits its four-byte
        // marker on every call, so that condition never comes true and the
        // loop runs until memory does.
        if offset >= input.len() && produced < spare {
            return Ok(());
        }
    }
}

fn rect_header(r: Rect, encoding: i32) -> Vec<u8> {
    let mut out = Vec::with_capacity(12);
    out.extend_from_slice(&u16::try_from(r.x).unwrap_or(u16::MAX).to_be_bytes());
    out.extend_from_slice(&u16::try_from(r.y).unwrap_or(u16::MAX).to_be_bytes());
    out.extend_from_slice(&u16::try_from(r.w).unwrap_or(u16::MAX).to_be_bytes());
    out.extend_from_slice(&u16::try_from(r.h).unwrap_or(u16::MAX).to_be_bytes());
    out.extend_from_slice(&encoding.to_be_bytes());
    out
}

/// Send one FramebufferUpdate. Returns false when there was nothing to send,
/// which leaves the client's request outstanding rather than answering it with
/// an empty update.
async fn send_update(
    sink: &mut SplitSink<WebSocketStream<TcpStream>, Message>,
    frame: &Frame,
    incremental: bool,
    view: &mut View,
) -> Result<bool> {
    let resized = frame.width != view.width || frame.height != view.height;
    if resized {
        if !view.desktop_size {
            // Without DesktopSize the client's framebuffer is fixed at the size
            // it was told at init, so a resized window can no longer be served
            // truthfully. Say so rather than shipping skewed rows.
            bail!(
                "window resized to {}x{} and the client did not offer DesktopSize",
                frame.width,
                frame.height
            );
        }
        view.width = frame.width;
        view.height = frame.height;
        view.have_prev = false;
    }
    if view.prev.len() != frame.rgba.len() {
        view.prev = vec![0; frame.rgba.len()];
        view.have_prev = false;
    }

    let full = Rect { x: 0, y: 0, w: frame.width, h: frame.height };
    let content: Vec<Rect> = if view.have_prev && incremental {
        dirty_rects(&view.prev, &frame.rgba, frame.width, frame.height)
    } else {
        vec![full]
    };
    if content.is_empty() && !resized {
        return Ok(false);
    }

    let mut header = Vec::with_capacity(4);
    header.push(0); // FramebufferUpdate
    header.push(0);
    let count = content.len() + usize::from(resized);
    header.extend_from_slice(&u16::try_from(count)?.to_be_bytes());
    sink.send(Message::Binary(header)).await?;

    if resized {
        sink.send(Message::Binary(rect_header(full, ENCODING_DESKTOP_SIZE))).await?;
    }

    let stride = frame.width as usize * 4;
    for r in &content {
        sink.send(Message::Binary(rect_header(*r, view.encoding))).await?;
        let row_bytes = r.w as usize * 4;
        if view.encoding == ENCODING_ZLIB {
            // Rows go through the compressor as they are cut, so a full-frame
            // rect never materialises 16 MB of uncompressed pixels.
            let mut compressed = Vec::with_capacity(64 * 1024);
            let mut row_buf = vec![0_u8; row_bytes];
            for i in 0..r.h {
                let start = (r.y + i) as usize * stride + r.x as usize * 4;
                row_buf.copy_from_slice(&frame.rgba[start..start + row_bytes]);
                if view.swap_rb {
                    for px in row_buf.chunks_exact_mut(4) {
                        px.swap(0, 2);
                    }
                }
                // Only the last row flushes: a sync marker per row would cost
                // more than it saves.
                let flush = if i + 1 == r.h { FlushCompress::Sync } else { FlushCompress::None };
                deflate(&mut view.zlib, &row_buf, &mut compressed, flush)?;
            }
            let mut framed = Vec::with_capacity(compressed.len() + 4);
            framed.extend_from_slice(&u32::try_from(compressed.len())?.to_be_bytes());
            framed.extend_from_slice(&compressed);
            sink.send(Message::Binary(framed)).await?;
        } else {
            let rows_per_chunk = (CHUNK_BYTES / row_bytes.max(1)).max(1);
            let mut row = 0;
            while row < r.h {
                let rows = rows_per_chunk.min((r.h - row) as usize);
                let mut chunk = Vec::with_capacity(rows * row_bytes);
                for i in 0..rows {
                    let start = (r.y + row + i as u32) as usize * stride + r.x as usize * 4;
                    chunk.extend_from_slice(&frame.rgba[start..start + row_bytes]);
                }
                if view.swap_rb {
                    for px in chunk.chunks_exact_mut(4) {
                        px.swap(0, 2);
                    }
                }
                sink.send(Message::Binary(chunk)).await?;
                row += rows as u32;
            }
        }
        // Only the region actually sent is promoted, so a full-frame memcpy is
        // not paid on every update.
        for i in 0..r.h {
            let start = (r.y + i) as usize * stride + r.x as usize * 4;
            view.prev[start..start + row_bytes]
                .copy_from_slice(&frame.rgba[start..start + row_bytes]);
        }
    }
    view.have_prev = true;
    Ok(true)
}

/// Buttons whose press should raise the window. Wheel "buttons" are excluded:
/// scrolling a mirror you are only reading should not steal the desktop.
const PRESSED_BUTTONS: u8 =
    crate::input::button::LEFT | crate::input::button::MIDDLE | crate::input::button::RIGHT;

/// Run an injection, raising the window first when `raise` is set.
///
/// Injection failures are logged rather than propagated: the system can refuse
/// to raise a window for reasons that have nothing to do with this viewer, and
/// dropping the connection over it would turn a missed click into a black pane.
fn inject(
    injector: &SharedInjector,
    raise: bool,
    action: impl FnOnce(&mut Injector) -> Result<()>,
) {
    let Some(injector) = injector else { return };
    let mut injector = injector.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    if raise {
        if let Err(e) = injector.focus() {
            eprintln!("{}", serde_json::json!({"event": "focus_failed", "reason": e.to_string()}));
        }
    }
    if let Err(e) = action(&mut injector) {
        eprintln!("{}", serde_json::json!({"event": "inject_failed", "reason": e.to_string()}));
    }
}

async fn read_loop(
    mut source: SplitStream<WebSocketStream<TcpStream>>,
    leftover: Vec<u8>,
    tx: mpsc::Sender<ClientMsg>,
) {
    let mut buf = leftover;
    loop {
        match parse_client_msg(&buf) {
            Ok(Some((msg, used))) => {
                buf.drain(..used);
                if tx.send(msg).await.is_err() {
                    return;
                }
                continue;
            }
            Ok(None) => {}
            Err(_) => return,
        }
        let Some(Ok(msg)) = source.next().await else { return };
        match msg {
            Message::Binary(data) => buf.extend_from_slice(&data),
            Message::Text(text) => buf.extend_from_slice(text.as_bytes()),
            Message::Close(_) => return,
            _ => {}
        }
    }
}

async fn serve_client(
    socket: TcpStream,
    latest: Arc<Latest>,
    title: String,
    injector: SharedInjector,
) -> Result<()> {
    let ws = tokio_tungstenite::accept_hdr_async(
        socket,
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         mut res: tokio_tungstenite::tungstenite::handshake::server::Response| {
            // noVNC asks for the `binary` subprotocol; a server that does not
            // echo it back gets dropped by the browser.
            if let Some(offered) = req.headers().get("sec-websocket-protocol") {
                if offered.to_str().unwrap_or("").split(',').any(|p| p.trim() == "binary") {
                    if let Ok(value) = "binary".parse() {
                        res.headers_mut().insert("sec-websocket-protocol", value);
                    }
                }
            }
            Ok(res)
        },
    )
    .await
    .context("websocket handshake failed")?;

    let mut frames = latest.subscribe();
    // A viewer cannot be told a framebuffer size before one exists.
    let first = loop {
        let current = frames.borrow_and_update().clone();
        if let Some(frame) = current {
            break frame;
        }
        frames.changed().await?;
    };

    let mut stream = Stream::new(ws);
    handshake(&mut stream, u16::try_from(first.width)?, u16::try_from(first.height)?, &title)
        .await?;

    let Stream { ws, buf, pos } = stream;
    let leftover = buf[pos..].to_vec();
    let (mut sink, source) = ws.split();
    let (tx, mut rx) = mpsc::channel(64);
    tokio::spawn(read_loop(source, leftover, tx));

    let mut view = View {
        prev: Vec::new(),
        width: first.width,
        height: first.height,
        have_prev: false,
        swap_rb: false,
        desktop_size: false,
        encoding: ENCODING_RAW,
        zlib: Compress::new(Compression::fast(), true),
    };
    let mut pending: Option<bool> = None;

    loop {
        tokio::select! {
            msg = rx.recv() => {
                let Some(msg) = msg else { return Ok(()) };
                match msg {
                    ClientMsg::SetPixelFormat(pf) => {
                        view.swap_rb = pf.swap_rb()?;
                        // Framebuffer contents are undefined across a format
                        // change, so the next update has to be a full one.
                        view.have_prev = false;
                    }
                    ClientMsg::SetEncodings(encodings) => {
                        if !encodings.contains(&ENCODING_RAW) {
                            bail!("client does not support the Raw encoding");
                        }
                        view.desktop_size = encodings.contains(&ENCODING_DESKTOP_SIZE);
                        // Zlib over Raw whenever it is on offer: same pixels,
                        // an order of magnitude fewer bytes on a flat UI.
                        view.encoding = if encodings.contains(&ENCODING_ZLIB) {
                            ENCODING_ZLIB
                        } else {
                            ENCODING_RAW
                        };
                    }
                    ClientMsg::FbUpdateRequest { incremental } => {
                        // A non-incremental request supersedes a pending
                        // incremental one; it asks for strictly more.
                        pending = Some(pending.unwrap_or(true) && incremental);
                    }
                    ClientMsg::Pointer { mask, x, y } => {
                        // Raising on a press rather than on motion: a viewer
                        // moving the cursor across the window should not yank
                        // focus, but a click has to land in a focused window.
                        inject(&injector, mask & PRESSED_BUTTONS != 0, |i| {
                            i.pointer(mask, (u32::from(x), u32::from(y)), (view.width, view.height))
                        });
                    }
                    ClientMsg::Key { down, keysym } => {
                        inject(&injector, down, |i| i.key(down, keysym));
                    }
                    // Clipboard is not wired up; dropping it keeps the byte
                    // stream in step, which is all this arm has to do.
                    ClientMsg::CutText(_) => {}
                }
            }
            changed = frames.changed(), if pending.is_some() => {
                changed?;
            }
        }

        if let Some(incremental) = pending {
            let frame = frames.borrow_and_update().clone();
            if let Some(frame) = frame {
                if send_update(&mut sink, &frame, incremental, &mut view).await? {
                    pending = None;
                }
            }
        }
    }
}

/// Serve `latest` over RFB on `listener` until the process is stopped.
pub async fn serve(
    listener: TcpListener,
    latest: Arc<Latest>,
    title: String,
    injector: SharedInjector,
) -> Result<()> {
    loop {
        let (socket, peer) = listener.accept().await?;
        let latest = Arc::clone(&latest);
        let title = title.clone();
        let injector = injector.clone();
        tokio::spawn(async move {
            if let Err(e) = serve_client(socket, latest, title, injector).await {
                eprintln!(
                    "{}",
                    serde_json::json!({
                        "event": "client_ended",
                        "peer": peer.to_string(),
                        "reason": e.to_string(),
                    })
                );
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::{
        deflate, dirty_rects, parse_client_msg, ClientMsg, Compress, Compression, FlushCompress,
        PixelFormat, Rect,
    };

    #[test]
    fn native_format_round_trips() {
        let mut out = Vec::new();
        PixelFormat::NATIVE.write(&mut out);
        assert_eq!(out.len(), 16);
        assert_eq!(PixelFormat::parse(&out), PixelFormat::NATIVE);
        assert!(!PixelFormat::NATIVE.swap_rb().unwrap());
    }

    #[test]
    fn a_bgr_client_asks_for_a_swap() {
        let bgr = PixelFormat { r_shift: 16, b_shift: 0, ..PixelFormat::NATIVE };
        assert!(bgr.swap_rb().unwrap());
    }

    #[test]
    fn an_indexed_colour_client_is_refused_rather_than_rendered_wrong() {
        let indexed = PixelFormat { bpp: 8, true_colour: false, ..PixelFormat::NATIVE };
        assert!(indexed.swap_rb().is_err());
    }

    #[test]
    fn a_partial_message_is_not_a_parse_error() {
        // SetEncodings claiming two encodings, with only one delivered.
        let partial = [2, 0, 0, 2, 0, 0, 0, 0];
        assert!(parse_client_msg(&partial).unwrap().is_none());
    }

    #[test]
    fn set_encodings_parses_negative_pseudo_encodings() {
        let mut msg = vec![2, 0, 0, 2];
        msg.extend_from_slice(&0_i32.to_be_bytes());
        msg.extend_from_slice(&(-223_i32).to_be_bytes());
        let (parsed, used) = parse_client_msg(&msg).unwrap().unwrap();
        assert_eq!(used, 12);
        match parsed {
            ClientMsg::SetEncodings(e) => assert_eq!(e, vec![0, -223]),
            other => panic!("expected SetEncodings, got {other:?}"),
        }
    }

    #[test]
    fn deflating_a_frames_worth_of_rows_terminates_and_round_trips() {
        // Regression: a sync flush with no input left emits a marker every
        // call, so a loop that waits for zero output never ends.
        let mut z = Compress::new(Compression::fast(), true);
        let row = vec![0x2b_u8; 4 * 1024];
        let rows = 300;
        let mut out = Vec::new();
        for i in 0..rows {
            let flush =
                if i + 1 == rows { FlushCompress::Sync } else { FlushCompress::None };
            deflate(&mut z, &row, &mut out, flush).unwrap();
        }
        let mut decoder = flate2::Decompress::new(true);
        let mut back = Vec::with_capacity(row.len() * rows);
        decoder.decompress_vec(&out, &mut back, flate2::FlushDecompress::Sync).unwrap();
        assert_eq!(back.len(), row.len() * rows, "every row must survive the round trip");
        assert!(out.len() < row.len() * rows / 100, "flat rows should compress hard");
    }

    #[test]
    fn unchanged_frames_produce_no_rects() {
        let buf = vec![7_u8; 128 * 128 * 4];
        assert!(dirty_rects(&buf, &buf, 128, 128).is_empty());
    }

    #[test]
    fn adjacent_dirty_tiles_merge_into_one_rect() {
        let width = 256_usize;
        let height = 64_usize;
        let prev = vec![0_u8; width * height * 4];
        let mut cur = prev.clone();
        // One pixel in tile column 1, one in tile column 2.
        cur[(10 * width + 70) * 4] = 255;
        cur[(10 * width + 130) * 4] = 255;
        let rects = dirty_rects(&prev, &cur, width as u32, height as u32);
        assert_eq!(rects, vec![Rect { x: 64, y: 0, w: 128, h: 64 }]);
    }

    #[test]
    fn separated_dirty_tiles_stay_separate() {
        let width = 256_usize;
        let height = 64_usize;
        let prev = vec![0_u8; width * height * 4];
        let mut cur = prev.clone();
        cur[(10 * width + 10) * 4] = 255;
        cur[(10 * width + 200) * 4] = 255;
        let rects = dirty_rects(&prev, &cur, width as u32, height as u32);
        assert_eq!(
            rects,
            vec![Rect { x: 0, y: 0, w: 64, h: 64 }, Rect { x: 192, y: 0, w: 64, h: 64 }]
        );
    }
}
