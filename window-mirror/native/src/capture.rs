//! Continuous capture of a single window.
//!
//! The probe in `main.rs` uses `xcap`, which re-grabs the window on every call
//! and tops out around 22 fps. Streaming needs the compositor to hand us frames
//! instead, so this module drives Windows Graphics Capture and publishes the
//! most recent frame for whoever is serving it.

use std::sync::Arc;
use tokio::sync::watch;

/// One captured frame, tightly packed RGBA.
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    /// How many regions the compositor said changed in this frame. Whether
    /// this is trustworthy enough to replace the pixel diff is what
    /// `dirty-bench` exists to answer.
    pub dirty_regions: usize,
}

/// The latest frame, published to whoever is serving it.
///
/// Deliberately last-writer-wins rather than a queue: a viewer that has fallen
/// behind wants the newest frame, not the backlog.
pub struct Latest {
    tx: watch::Sender<Option<Arc<Frame>>>,
}

impl Latest {
    #[must_use]
    pub fn new() -> Arc<Self> {
        Arc::new(Self { tx: watch::channel(None).0 })
    }

    pub fn publish(&self, frame: Frame) {
        // A send with no receivers is not an error here; the capture keeps
        // running between viewers.
        let _ = self.tx.send(Some(Arc::new(frame)));
    }

    #[must_use]
    pub fn subscribe(&self) -> watch::Receiver<Option<Arc<Frame>>> {
        self.tx.subscribe()
    }
}

#[derive(Debug)]
pub struct CaptureError(pub String);

impl std::fmt::Display for CaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CaptureError {}

#[cfg(windows)]
pub use windows_impl::{is_capturable, start};

#[cfg(windows)]
mod windows_impl {
    use super::{CaptureError, Frame, Latest};
    use std::sync::Arc;
    use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
    use windows_capture::frame::Frame as WgcFrame;
    use windows_capture::graphics_capture_api::InternalCaptureControl;
    use windows_capture::settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    };
    use windows_capture::window::Window;

    struct Handler {
        latest: Arc<Latest>,
        /// Reused across frames so unpadding does not allocate 15 MB a frame.
        scratch: Vec<u8>,
    }

    impl GraphicsCaptureApiHandler for Handler {
        type Flags = Arc<Latest>;
        type Error = CaptureError;

        fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
            Ok(Self { latest: ctx.flags, scratch: Vec::new() })
        }

        fn on_frame_arrived(
            &mut self,
            frame: &mut WgcFrame,
            _control: InternalCaptureControl,
        ) -> Result<(), Self::Error> {
            let width = frame.width();
            let height = frame.height();
            // The GPU hands back rows padded to its own stride; RFB wants them
            // packed, and so does every consumer downstream.
            let dirty_regions = frame.dirty_regions().map_or(0, |r| r.len());
            let buffer = frame.buffer().map_err(|e| CaptureError(e.to_string()))?;
            let rgba = buffer.as_nopadding_buffer(&mut self.scratch).to_vec();
            self.latest.publish(Frame { width, height, rgba, dirty_regions });
            Ok(())
        }

        fn on_closed(&mut self) -> Result<(), Self::Error> {
            Ok(())
        }
    }

    /// Whether the graphics capture API will accept this window.
    ///
    /// Enumeration and capture do not agree on their own: `xcap` lists windows
    /// that Windows Graphics Capture then refuses, and without this check the
    /// pane offers a window and fails the moment it is picked.
    #[must_use]
    pub fn is_capturable(hwnd: u32) -> bool {
        Window::from_raw_hwnd(hwnd as usize as *mut std::ffi::c_void).is_valid()
    }

    /// Start capturing `hwnd` on a background thread. Dropping the returned
    /// control stops the capture.
    pub fn start(
        hwnd: u32,
        latest: Arc<Latest>,
    ) -> Result<impl Send, Box<dyn std::error::Error + Send + Sync>> {
        let window = Window::from_raw_hwnd(hwnd as usize as *mut std::ffi::c_void);
        if !window.is_valid() {
            return Err(Box::new(CaptureError(format!("hwnd {hwnd} is not a capturable window"))));
        }
        let settings = Settings::new(
            window,
            CursorCaptureSettings::WithoutCursor,
            DrawBorderSettings::WithoutBorder,
            SecondaryWindowSettings::Default,
            MinimumUpdateIntervalSettings::Default,
            DirtyRegionSettings::ReportOnly,
            ColorFormat::Rgba8,
            latest,
        );
        Ok(Handler::start_free_threaded(settings)?)
    }
}
