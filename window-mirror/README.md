# Window Mirror

Mirror one desktop window into a dinotty pane, and watch it from any device.

> Status: M5. The pane picks a window, shows it live over a compressed stream,
> and — once you take control — clicks and types into it, from a phone as well
> as a desktop.

## Why this is not WebRTC

Everything has to reach the browser through dinotty's single port, because that
is all a phone or a Cloudflare tunnel can see. WebRTC media is UDP over ICE and
does not fit through it, which rules out the neko / Selkies / Sunshine family of
designs. What does fit is `/preview/<port>/`: dinotty already reverse-proxies a
loopback port, forwards binary WebSocket frames, passes the subprotocol header
through, and rejects non-loopback callers without a session or Bearer token.

So the sidecar serves **RFB over WebSocket** on a loopback port and the pane
points [noVNC](https://novnc.com/) at `/preview/<port>/`:

```
pane (browser, dist/main.js)            noVNC RFB.js
        |  ctx.exec.run(['list'])                      <- which windows exist
        |  ctx.process.start(['serve', '--announce'])  <- start the capture
        |  ctx.storage.get(key) -> { port }            <- where to connect
        v
    ws://<dinotty>/preview/<port>/   --proxied-->  127.0.0.1:<port>
        v
sidecar (dist/window-mirror.exe)
        |  Windows Graphics Capture -> RFB, zlib over a dirty-tile diff
        |  RFB pointer/key events  -> SetForegroundWindow + SendInput
        v
    one window
```

Authentication, tunnelling and mobile reach come from dinotty; touch gestures,
the on-screen keyboard, pinch-zoom, clipboard and the framebuffer decoding come
from noVNC. The only part written here is the window-to-framebuffer half.

That means no dinotty core change is required, and no plugin network
permission — the pane talks to an ordinary same-origin URL.

### Why the capture is a managed process

`ctx.exec.spawn`'s WebSocket owns the child's lifetime, so a phone locking its
screen would kill the capture. `ctx.process.start` is supervised independently,
but a managed process cannot stream anything back — which is fine here, because
the pixels never travel through `PluginContext` at all. The only thing that has
to cross is a port number, and it crosses as a file: `--announce <key>` writes
`$DINOTTY_PLUGIN_DATA_DIR/<key>.json`, which `ctx.storage.get(key)` reads.

Picking a mirror back up on another device is then just reading that
announcement again, which is what `reattachOrList` does on mount.

## Findings

### M1 — capture

Measured on Windows 11 against Claude Desktop, `xcap` 0.9.8:

| | result |
|---|---|
| Enumeration | id, pid, app, title, geometry, minimized, focused |
| Occluded window | **captures correctly** — a window fully behind two others returns its own pixels |
| DPI | reported 2560x1552 vs captured 2552x1544; the 8 px is the invisible DWM resize border, scale 1.0 |
| Frame time | p50 45.9 ms → 21.9 fps ceiling |

21.9 fps is `xcap`'s BitBlt path, too slow to stream from. It stays for
enumeration and single grabs; the streaming path is Windows Graphics Capture.

### M2 — streaming

| | result |
|---|---|
| WGC frame arrivals | p50 19.5 ms, p95 29.3 ms → **48 fps** at 2560x1552 |
| Full update | 7.1 MB of raw pixels in 11 ms on loopback |
| Incremental update | 2 rects, **32.8 kB** of raw pixels — a 216x reduction, which is the whole argument for the tile diff |
| Through the dinotty proxy | `ws://127.0.0.1:8999/preview/<port>/` delivers `RFB 003.008` and echoes the `binary` subprotocol |
| noVNC in a browser | connects, and renders Claude Desktop's actual palette on a 2000x1399 canvas |

Not yet verified: a minimized window (WGC cannot capture one), the other four
host targets, and the pane inside dinotty itself — dev-linking it needs the
native-permission approval, which is the user's to give. Every layer below the
pane has been exercised against the real host.

### M3 — input

`SendInput` delivers to whatever is focused, and synthesised `WM_*` messages
posted at a background Chromium window are ignored by its input stack. So the
mirrored window is raised before input reaches it — on a button press or a key,
never on plain motion, so moving the cursor across a mirror does not yank the
desktop away from whoever is at the machine.

| | result |
|---|---|
| Pointer mapping | **pixel-exact** at the window's origin, centre, and an interior point |
| Bottom-right corner | landed 53 px short — the window extended past the right edge of the display, so that region is visible in the capture but unreachable by any cursor (see below) |
| Through RFB end to end | a `PointerEvent` at the framebuffer centre put the real cursor on exactly the predicted screen pixel |
| Key events end to end | a `KeyEvent` for Shift leaves the host reporting the key held, and released again on key-up |
| `--view-only` | ignores both, verified by the same test |

Keys go through their virtual-key code when the active layout has one, so Ctrl+C
still reaches the application, and fall back to `KEYEVENTF_UNICODE` when it does
not — which is how a CJK character gets in. The keysym table and both paths are
unit-tested. The live test uses Shift, which is observable through
`GetAsyncKeyState` and changes nothing on its own; a key that produced text
would type into whatever window the test had just raised.

### M4 — using it from a phone

noVNC's core already handles touch, and most of what a mirror needs is there:
one-finger tap is a left click, two fingers a right click, three a middle
click, a long press holds the button down, and a two-finger drag scrolls.
Pinch is taken — it sends Ctrl+wheel to the *remote* application — so there is
no viewport zoom to inherit, and there is no keyboard in the core library at
all. Those two gaps are what M4 fills.

**Two view modes instead of a zoom.** Measured in a browser with the pane sized
to a phone:

| | canvas | on screen |
|---|---|---|
| Fit | 2000x1399 (the whole framebuffer) | 390x273 |
| 1:1 | 390x600 (a crop of it) | 390x600 |

In Fit, one CSS pixel is 5.1 framebuffer pixels, so a 44 px fingertip covers
226 pixels of desktop — fine for seeing what a window is doing, useless for
hitting anything. In 1:1 the mapping is exact and a tap lands on the pixel it
was aimed at, with a one-finger drag panning instead of dragging (`clipViewport`
plus `dragViewport`; tap still clicks, so nothing is given up). Switching
between "where am I" and "do something" is the whole interaction, and it is one
button.

**A keyboard.** A mobile browser raises its on-screen keyboard only for a
focused text field, and reports most keys as *text* rather than as `keydown`.
So the pane keeps a hidden padded field and works out what happened by diffing
its value — the same trick noVNC's own web app uses, which lives in its app
rather than in the library. The padding is load-bearing: with an empty field a
backspace produces no event at all and the delete is silently lost.
Compositions are held back until `compositionend`, so an IME does not send its
intermediate keystrokes to the host.

Above that sits a row for the keys a phone does not have — Ctrl, Alt and Shift
as latches that clear after the next key, plus Esc, Tab and the arrows.

### M5 — compression, and a dirty-region idea that did not survive measurement

Rects now go out through one zlib stream per connection, never reset, so its
dictionary carries across updates. noVNC advertises encoding 6 and has a decoder
for it, so this costs the client nothing.

Ratios move with what the window is showing, so both ends of what was measured
on the same 2339x1399 Claude Desktop window are given:

| | pixels | on the wire |
|---|---|---|
| Full update, flat UI | 13.1 MB | **0.36 MB — 36x** |
| Full update, a screenshot on screen | 13.1 MB | 1.08 MB — 12x |
| Incremental update | 180-197 kB | **12-13 kB — 15x** |

Against a full uncompressed frame, an incremental update is now about 1000x
smaller. That is the tile diff and the encoding multiplying together, and it is
what makes the mirror usable over a phone connection rather than only on a LAN.

The other half of M5 was going to be replacing the pixel diff with the dirty
regions the compositor already computes. Measuring it first killed it:

| | measured |
|---|---|
| Full-frame diff scan, 13.1 MB, worst case | p50 **5.8 ms** |
| Frames in 6 s reporting *no* dirty regions | **0 of 128** |
| Dirty regions reported in total | 131, so about one per frame |

The scan is not where an update's time goes — an incremental update takes 22 ms,
of which the scan is 6 ms and compression is the rest. And there is no free skip
to be had: WGC only delivers a frame when something changed, so "nothing is
dirty" never happens.

What is left is using the regions to *narrow* the scan, and that would mean
accumulating damage across the frames the last-writer-wins channel drops, and
trusting the compositor to never under-report. That trades an exactly correct
mechanism for a saving that is not the bottleneck, on a guarantee this has not
verified. So the diff stays, and `stream-bench` reports the region counts so the
next person can re-run the argument rather than take it on faith.

Worth trying before revisiting this: `MinimumUpdateIntervalSettings`, which caps
the capture rate at the source and cuts scan *and* capture cost with no
correctness risk at all.

### Enumeration and capture disagree

`xcap` lists windows that Windows Graphics Capture then refuses, so `list`
checks each one against the capture API before offering it — otherwise the pane
shows a window that fails the moment it is picked. Found by the test suite,
which picks the first listed window when none is named.

### A window hanging off the edge of the display

The capture is of the window's own composition, so it includes parts of the
window that are outside the desktop. Input cannot follow: the cursor clamps to
the virtual screen. Those regions are visible and unclickable, and
`map_to_screen` clamps rather than pretending otherwise. Moving the window fully
on-screen is the fix; detecting and reporting the condition in the pane is not
done.

### Two things that will bite anyone extending this

**noVNC 1.7 uses top-level await** (its WebCodecs H.264 probe), so the bundle
must be ESM. An IIFE build fails outright. dinotty imports plugin entries as
modules, so this only matters if you try to bundle noVNC for something else.

**Pages served through `/preview/` get a `window.WebSocket` shim injected**, which
rewrites socket URLs under the proxied app's own prefix so that a dev server's
HMR works. A test page served that way cannot reach a *different* `/preview/`
port — its URL gets rewritten to `/preview/<pageport>/preview/<rfbport>/`. The
pane is served from the origin root and is unaffected, but a probe harness that
proxies itself will chase this for a while.

## Usage

```bash
npm install && npm run build
```

Then dev-link the directory into dinotty and open **Add Pane → Window Mirror**.

The native probe is usable on its own:

```bash
./native/target/release/window-mirror list
./native/target/release/window-mirror grab --id <id> --max-width 700 --out frame.png
./native/target/release/window-mirror bench --id <id> --frames 30
./native/target/release/window-mirror stream-bench --hwnd <id> --seconds 5
./native/target/release/window-mirror serve --hwnd <id> [--view-only]
./native/target/release/window-mirror pointer-probe --hwnd <id> --fx 0.5 --fy 0.5
./native/target/release/window-mirror cursor
./native/target/release/window-mirror diff-bench --hwnd <id>
```

`pointer-probe` raises the window and moves the real cursor to a fractional
position inside it, then reports where it landed — the quickest way to tell a
coordinate-mapping bug from a display-geometry one.

## Tests

```bash
npm test
```

`test:keys` covers the soft-keyboard diff, which is the part that fails quietly:
get it wrong and the host receives a deletion the user never made.
`test:native` covers pixel-format negotiation, the client-message parser's
partial-message handling, the tile merge, the keysym table and the coordinate
arithmetic. `test:rfb` starts a real server against a real window, speaks the
protocol back at it with Node's built-in WebSocket, and decodes the framebuffer
to a PNG — the byte layout is the part unit tests cannot check. `test:input`
drives a pointer event through the same path and then asks the OS where the
cursor went.

The two integration tests raise a real window on a real desktop and move the
real cursor, rather than mocking the one thing that cannot be mocked. That
makes them racy by construction: a hand on the mouse wins, so the pointer
assertions retry and allow a few pixels of slack. The slack is not cosmetic —
absolute positioning is quantised to 1/65535 of the virtual desktop, which is
more than a pixel once a second monitor is attached.

## Roadmap

- [x] **M1** — enumerate windows, capture one, measure the ceiling
- [x] **M2** — WGC capture loop, RFB-over-WebSocket, noVNC in a read-only pane
- [x] **M3** — input injection, with a per-viewer control toggle and a hard
      `--view-only` server mode
- [x] **M4** — view modes, a soft keyboard, and the modifier keys a phone lacks
- [x] **M5** — zlib encoding. The dirty-region half was measured and dropped;
      see above
- [ ] Ports to the other four host targets

## Security

A window this plugin mirrors is fully readable **and fully clickable** by anyone
holding a dinotty session.

Taking control is off when a pane opens, and turning it on is a deliberate act,
because the first click raises the window and takes the desktop from whoever is
sitting at it. That toggle is ergonomics, not a boundary: it lives in the
client. The boundary is `--view-only` on the server, which drops input whatever
a client sends. Reaching dinotty from a phone on
the LAN is plain `http://<lan-ip>:8999`. Mirror accordingly.

The RFB server offers security type None. That is deliberate: it binds to
loopback and is only reachable through dinotty's proxy, which has already
authenticated the caller. A VNC password here would be a second secret to leak,
not a second lock.

## Licences

This plugin is MIT. It bundles [noVNC](https://github.com/novnc/noVNC), which is
MPL-2.0; that licence is per-file and is preserved in the bundle.
