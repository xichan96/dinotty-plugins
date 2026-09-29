//! M1 probe for the window-mirror plugin.
//!
//! Answers the three questions M1 exists to answer, before any protocol work:
//!   * can we enumerate the window we want (`list`),
//!   * can we capture it while it is occluded by other windows (`grab`),
//!   * how fast can we capture it, and does the frame size match the window
//!     size the compositor reports (`bench` -- a mismatch means DPI scaling).

mod capture;
mod input;
mod rfb;

use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::TcpListener;
use xcap::Window;

#[derive(Parser)]
#[command(name = "window-mirror", version, about = "Mirror a single desktop window")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Print capturable windows as JSON.
    List {
        /// Keep untitled and zero-sized windows, which are filtered out by default.
        #[arg(long)]
        all: bool,
    },
    /// Capture one frame from a window into a PNG.
    Grab {
        #[arg(long)]
        id: u32,
        #[arg(long, default_value = "frame.png")]
        out: String,
        /// Downscale the saved PNG to at most this width, for eyeballing a
        /// capture without moving a full-resolution frame around.
        #[arg(long)]
        max_width: Option<u32>,
    },
    /// Serve one window over RFB on a loopback WebSocket port.
    Serve {
        #[arg(long)]
        hwnd: u32,
        /// 0 lets the OS pick, which is the normal case: the port is reported
        /// on stdout and through --announce.
        #[arg(long, default_value_t = 0)]
        port: u16,
        /// Serve pixels but refuse input, regardless of what a client sends.
        /// The pane also has a read-only toggle; that one is a convenience,
        /// this one is the boundary.
        #[arg(long)]
        view_only: bool,
        /// Also write the listening details to
        /// `$DINOTTY_PLUGIN_DATA_DIR/<key>.json`, where `ctx.storage.get(key)`
        /// in the pane can read them.
        #[arg(long)]
        announce: Option<String>,
    },
    /// Raise a window and move the real cursor to a fractional position inside
    /// it, reporting where it actually landed. Verifies the coordinate mapping
    /// without a viewer attached.
    PointerProbe {
        #[arg(long)]
        hwnd: u32,
        /// 0.0 is the left edge of the window, 1.0 the right.
        #[arg(long, default_value_t = 0.5)]
        fx: f64,
        /// 0.0 is the top edge, 1.0 the bottom.
        #[arg(long, default_value_t = 0.5)]
        fy: f64,
    },
    /// Time the dirty-tile scan on a real frame, to decide whether it is worth
    /// replacing with the dirty regions the compositor already reports.
    DiffBench {
        #[arg(long)]
        hwnd: u32,
        #[arg(long, default_value_t = 20)]
        iterations: u32,
    },
    /// Print the current cursor position, so a test can check where an
    /// injected pointer event actually landed.
    Cursor,
    /// Report whether a virtual key is currently held down.
    KeyState {
        /// Virtual-key code, e.g. 160 for left shift.
        #[arg(long)]
        vk: u16,
    },
    /// Drive the streaming capture path for a while and report frame arrivals.
    StreamBench {
        #[arg(long)]
        hwnd: u32,
        #[arg(long, default_value_t = 5)]
        seconds: u64,
    },
    /// Capture repeatedly and report per-frame timing.
    Bench {
        #[arg(long)]
        id: u32,
        #[arg(long, default_value_t = 30)]
        frames: u32,
    },
}

#[derive(Serialize)]
struct WindowInfo {
    id: u32,
    pid: u32,
    app: String,
    title: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    minimized: bool,
    focused: bool,
}

fn describe(w: &Window) -> Result<WindowInfo> {
    Ok(WindowInfo {
        id: w.id()?,
        pid: w.pid()?,
        app: w.app_name()?,
        title: w.title()?,
        x: w.x()?,
        y: w.y()?,
        width: w.width()?,
        height: w.height()?,
        minimized: w.is_minimized()?,
        focused: w.is_focused()?,
    })
}

/// The title dinotty should show for this window, looked up through the same
/// enumeration `list` uses so the two agree.
fn window_title(id: u32) -> Option<String> {
    Window::all()
        .ok()?
        .into_iter()
        .find(|w| w.id().map(|got| got == id).unwrap_or(false))
        .and_then(|w| w.title().ok())
        .filter(|t| !t.is_empty())
}

fn find(id: u32) -> Result<Window> {
    Window::all()?
        .into_iter()
        .find(|w| w.id().map(|got| got == id).unwrap_or(false))
        .ok_or_else(|| anyhow!("no window with id {id}"))
}

#[tokio::main]
async fn main() -> Result<()> {
    // Before any window geometry is read: without this the metrics come back
    // scaled while the capture is in physical pixels, and clicks land short.
    #[cfg(windows)]
    input::set_dpi_aware();

    match Cli::parse().cmd {
        Cmd::List { all } => {
            let mut out: Vec<WindowInfo> = Vec::new();
            for w in Window::all()? {
                // A window that fails to describe itself is one we could not
                // mirror either, so drop it rather than failing the whole list.
                let Ok(info) = describe(&w) else { continue };
                if all {
                    out.push(info);
                    continue;
                }
                if info.title.is_empty() || info.width == 0 || info.height == 0 {
                    continue;
                }
                #[cfg(windows)]
                if !capture::is_capturable(info.id) {
                    continue;
                }
                out.push(info);
            }
            println!("{}", serde_json::to_string_pretty(&out)?);
        }

        Cmd::Grab { id, out, max_width } => {
            let w = find(id)?;
            let info = describe(&w)?;
            let started = Instant::now();
            let image = w.capture_image()?;
            let elapsed = started.elapsed();
            let saved = match max_width {
                Some(max) if image.width() > max => {
                    let height = image.height() * max / image.width();
                    xcap::image::imageops::resize(
                        &image,
                        max,
                        height,
                        xcap::image::imageops::FilterType::Triangle,
                    )
                }
                _ => image.clone(),
            };
            saved.save(&out)?;
            println!(
                "{}",
                serde_json::json!({
                    "title": info.title,
                    "reported": { "width": info.width, "height": info.height },
                    "captured": { "width": image.width(), "height": image.height() },
                    "scale": f64::from(image.width()) / f64::from(info.width.max(1)),
                    "minimized": info.minimized,
                    "capture_ms": elapsed.as_secs_f64() * 1000.0,
                    "out": out,
                })
            );
        }

        Cmd::Serve { hwnd, port, view_only, announce } => {
            let title = window_title(hwnd).unwrap_or_else(|| format!("window {hwnd}"));
            let latest = capture::Latest::new();
            let _control =
                capture::start(hwnd, Arc::clone(&latest)).map_err(|e| anyhow!("{e}"))?;

            // Loopback only. Reaching this from another device is dinotty's
            // job, through /preview/<port>/, where the caller is authenticated.
            let listener = TcpListener::bind(("127.0.0.1", port)).await?;
            let bound = listener.local_addr()?.port();
            let injector: rfb::SharedInjector = if view_only {
                None
            } else {
                Some(Arc::new(std::sync::Mutex::new(input::Injector::new(hwnd))))
            };
            let announcement = serde_json::json!({
                "event": "listening",
                "port": bound,
                "hwnd": hwnd,
                "title": title,
                "path": format!("/preview/{bound}/"),
                "input": !view_only,
            });
            if let Some(key) = announce {
                let dir = std::env::var("DINOTTY_PLUGIN_DATA_DIR")
                    .map_err(|_| anyhow!("--announce needs DINOTTY_PLUGIN_DATA_DIR"))?;
                std::fs::write(
                    std::path::Path::new(&dir).join(format!("{key}.json")),
                    serde_json::to_vec(&announcement)?,
                )?;
            }
            println!("{announcement}");

            rfb::serve(listener, latest, title, injector).await?;
        }

        Cmd::PointerProbe { hwnd, fx, fy } => {
            // The capture is what defines the framebuffer a viewer would be
            // clicking on, so the probe maps through a real frame rather than
            // through the window rect alone.
            let latest = capture::Latest::new();
            let _control =
                capture::start(hwnd, Arc::clone(&latest)).map_err(|e| anyhow!("{e}"))?;
            let mut frames = latest.subscribe();
            let frame = loop {
                if let Some(frame) = frames.borrow_and_update().clone() {
                    break frame;
                }
                tokio::time::timeout(Duration::from_secs(5), frames.changed())
                    .await
                    .map_err(|_| anyhow!("no frame arrived within 5s"))??;
            };

            let mut injector = input::Injector::new(hwnd);
            injector.focus()?;
            let target = (
                (f64::from(frame.width - 1) * fx).round() as u32,
                (f64::from(frame.height - 1) * fy).round() as u32,
            );
            let expected = injector.screen_point(target, (frame.width, frame.height))?;
            injector.pointer(0, target, (frame.width, frame.height))?;
            // SendInput is queued, not synchronous; the cursor needs a moment.
            tokio::time::sleep(Duration::from_millis(50)).await;
            let actual = input::Injector::cursor_position()?;
            println!(
                "{}",
                serde_json::json!({
                    "frame": { "width": frame.width, "height": frame.height },
                    "framebuffer_point": { "x": target.0, "y": target.1 },
                    "expected_screen": { "x": expected.0, "y": expected.1 },
                    "actual_screen": { "x": actual.0, "y": actual.1 },
                    "error_px": { "x": actual.0 - expected.0, "y": actual.1 - expected.1 },
                })
            );
        }

        Cmd::DiffBench { hwnd, iterations } => {
            let latest = capture::Latest::new();
            let _control =
                capture::start(hwnd, Arc::clone(&latest)).map_err(|e| anyhow!("{e}"))?;
            let mut frames = latest.subscribe();
            let first = loop {
                if let Some(frame) = frames.borrow_and_update().clone() {
                    break frame;
                }
                tokio::time::timeout(Duration::from_secs(5), frames.changed())
                    .await
                    .map_err(|_| anyhow!("no frame arrived within 5s"))??;
            };

            // Against an identical buffer: the worst case for the scan, because
            // no tile can be skipped early on a mismatch.
            let identical = first.rgba.clone();
            let mut unchanged = Vec::new();
            for _ in 0..iterations {
                let started = Instant::now();
                let rects =
                    rfb::dirty_rects(&identical, &first.rgba, first.width, first.height);
                unchanged.push(started.elapsed().as_secs_f64() * 1000.0);
                assert!(rects.is_empty(), "a buffer compared with itself has no dirty tiles");
            }
            unchanged.sort_by(f64::total_cmp);

            println!(
                "{}",
                serde_json::json!({
                    "frame": { "width": first.width, "height": first.height },
                    "bytes": first.rgba.len(),
                    "scan_ms": {
                        "min": unchanged[0],
                        "p50": unchanged[unchanged.len() / 2],
                        "max": unchanged[unchanged.len() - 1],
                    },
                })
            );
        }

        Cmd::Cursor => {
            let (x, y) = input::Injector::cursor_position()?;
            println!("{}", serde_json::json!({ "x": x, "y": y }));
        }

        Cmd::KeyState { vk } => {
            println!(
                "{}",
                serde_json::json!({ "vk": vk, "down": input::Injector::key_is_down(vk) })
            );
        }

        Cmd::StreamBench { hwnd, seconds } => {
            let latest = capture::Latest::new();
            let _control =
                capture::start(hwnd, Arc::clone(&latest)).map_err(|e| anyhow!("{e}"))?;
            let mut frames = latest.subscribe();

            let deadline = Instant::now() + Duration::from_secs(seconds);
            let mut arrivals: Vec<f64> = Vec::new();
            let mut last = Instant::now();
            let mut dims = (0_u32, 0_u32);
            let mut quiet = 0_usize;
            let mut regions = 0_usize;
            while Instant::now() < deadline {
                if tokio::time::timeout(Duration::from_millis(500), frames.changed())
                    .await
                    .is_err()
                {
                    continue;
                }
                let Some(frame) = frames.borrow_and_update().clone() else { continue };
                dims = (frame.width, frame.height);
                if frame.dirty_regions == 0 {
                    quiet += 1;
                }
                regions += frame.dirty_regions;
                arrivals.push(last.elapsed().as_secs_f64() * 1000.0);
                last = Instant::now();
            }

            // The first gap includes capture startup, which is not a frame interval.
            if !arrivals.is_empty() {
                arrivals.remove(0);
            }
            if arrivals.is_empty() {
                return Err(anyhow!("no frames arrived in {seconds}s"));
            }
            let mut sorted = arrivals.clone();
            sorted.sort_by(f64::total_cmp);
            let mean = sorted.iter().sum::<f64>() / sorted.len() as f64;
            println!(
                "{}",
                serde_json::json!({
                    "frames": sorted.len(),
                    "size": { "width": dims.0, "height": dims.1 },
                    "interval_ms": {
                        "min": sorted[0],
                        "p50": sorted[sorted.len() / 2],
                        "p95": sorted[sorted.len() * 95 / 100],
                        "max": sorted[sorted.len() - 1],
                    },
                    "fps": 1000.0 / mean,
                    // If the compositor reliably says "nothing changed", the
                    // pixel diff can be skipped on those frames.
                    "frames_with_no_dirty_regions": quiet,
                    "total_dirty_regions": regions,
                })
            );
        }

        Cmd::Bench { id, frames } => {
            let w = find(id)?;
            let mut samples: Vec<f64> = Vec::with_capacity(frames as usize);
            let mut bytes = 0_usize;
            for _ in 0..frames {
                let started = Instant::now();
                let image = w.capture_image()?;
                samples.push(started.elapsed().as_secs_f64() * 1000.0);
                bytes = image.as_raw().len();
            }
            samples.sort_by(f64::total_cmp);
            let mean = samples.iter().sum::<f64>() / f64::from(frames);
            println!(
                "{}",
                serde_json::json!({
                    "frames": frames,
                    "raw_frame_bytes": bytes,
                    "ms": {
                        "min": samples[0],
                        "p50": samples[samples.len() / 2],
                        "p95": samples[samples.len() * 95 / 100],
                        "max": samples[samples.len() - 1],
                        "mean": mean,
                    },
                    "fps_ceiling": 1000.0 / mean,
                })
            );
        }
    }
    Ok(())
}
