//! Turning RFB pointer and key events back into real input.
//!
//! On Windows this means taking the foreground: `SendInput` delivers to
//! whatever is focused, and synthesised `WM_*` messages posted at a background
//! Chromium window are ignored by its input stack. So the mirrored window is
//! raised before input reaches it. That steals focus from whoever is sitting at
//! the machine -- which is the right trade only because the premise of this
//! plugin is that nobody is.
//!
//! The window is raised only when it is not already foreground, so a session of
//! typing does not re-raise on every keystroke.

/// X11 keysyms, which is what RFB carries regardless of the client's platform.
pub mod keysym {
    pub const BACKSPACE: u32 = 0xFF08;
    pub const TAB: u32 = 0xFF09;
    pub const RETURN: u32 = 0xFF0D;
    pub const ESCAPE: u32 = 0xFF1B;
    pub const HOME: u32 = 0xFF50;
    pub const LEFT: u32 = 0xFF51;
    pub const UP: u32 = 0xFF52;
    pub const RIGHT: u32 = 0xFF53;
    pub const DOWN: u32 = 0xFF54;
    pub const PAGE_UP: u32 = 0xFF55;
    pub const PAGE_DOWN: u32 = 0xFF56;
    pub const END: u32 = 0xFF57;
    pub const INSERT: u32 = 0xFF63;
    pub const F1: u32 = 0xFFBE;
    pub const F12: u32 = 0xFFC9;
    pub const SHIFT_L: u32 = 0xFFE1;
    pub const SHIFT_R: u32 = 0xFFE2;
    pub const CONTROL_L: u32 = 0xFFE3;
    pub const CONTROL_R: u32 = 0xFFE4;
    pub const CAPS_LOCK: u32 = 0xFFE5;
    pub const META_L: u32 = 0xFFE7;
    pub const META_R: u32 = 0xFFE8;
    pub const ALT_L: u32 = 0xFFE9;
    pub const ALT_R: u32 = 0xFFEA;
    pub const SUPER_L: u32 = 0xFFEB;
    pub const SUPER_R: u32 = 0xFFEC;
    pub const DELETE: u32 = 0xFFFF;
    /// Keysyms at or above this encode a Unicode codepoint directly.
    pub const UNICODE_BASE: u32 = 0x0100_0000;
}

/// What a keysym should be sent as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyAction {
    /// A virtual-key code, so that modifier combinations (Ctrl+C) still work.
    Virtual(u16),
    /// A character with no virtual key on the active layout, sent as a Unicode
    /// scan code. Modifier combinations do not survive this path, which is
    /// acceptable: there is no Ctrl+<CJK ideograph>.
    Unicode(u16),
    /// Nothing sensible to send.
    Ignore,
}

/// The Unicode codepoint an ordinary (non-function) keysym stands for.
#[must_use]
pub fn keysym_to_char(keysym: u32) -> Option<char> {
    // Latin-1 keysyms are their own codepoints, and so is the explicit
    // Unicode range. Everything between is a function key.
    let codepoint = match keysym {
        0x20..=0x7E | 0xA0..=0xFF => keysym,
        k if k >= keysym::UNICODE_BASE => k - keysym::UNICODE_BASE,
        _ => return None,
    };
    char::from_u32(codepoint)
}

/// The virtual-key code for a keysym that names a key rather than a character.
#[must_use]
pub fn keysym_to_vk(keysym: u32) -> Option<u16> {
    // Values from Win32 VIRTUAL_KEY; spelled out rather than imported so this
    // function can be tested on any host.
    let vk = match keysym {
        keysym::BACKSPACE => 0x08,
        keysym::TAB => 0x09,
        keysym::RETURN => 0x0D,
        keysym::ESCAPE => 0x1B,
        keysym::PAGE_UP => 0x21,
        keysym::PAGE_DOWN => 0x22,
        keysym::END => 0x23,
        keysym::HOME => 0x24,
        keysym::LEFT => 0x25,
        keysym::UP => 0x26,
        keysym::RIGHT => 0x27,
        keysym::DOWN => 0x28,
        keysym::INSERT => 0x2D,
        keysym::DELETE => 0x2E,
        keysym::CAPS_LOCK => 0x14,
        keysym::SHIFT_L => 0xA0,
        keysym::SHIFT_R => 0xA1,
        keysym::CONTROL_L => 0xA2,
        keysym::CONTROL_R => 0xA3,
        // Alt and Meta both land on the Windows Alt keys; a mirrored macOS
        // client sends Meta where a Windows one sends Alt.
        keysym::ALT_L | keysym::META_L => 0xA4,
        keysym::ALT_R | keysym::META_R => 0xA5,
        keysym::SUPER_L => 0x5B,
        keysym::SUPER_R => 0x5C,
        k if (keysym::F1..=keysym::F12).contains(&k) => 0x70 + (k - keysym::F1) as u16,
        _ => return None,
    };
    Some(vk)
}

/// RFB pointer button-mask bits.
pub mod button {
    pub const LEFT: u8 = 1;
    pub const MIDDLE: u8 = 1 << 1;
    pub const RIGHT: u8 = 1 << 2;
    pub const WHEEL_UP: u8 = 1 << 3;
    pub const WHEEL_DOWN: u8 = 1 << 4;
    pub const WHEEL_LEFT: u8 = 1 << 5;
    pub const WHEEL_RIGHT: u8 = 1 << 6;
}

/// Map a framebuffer coordinate onto the window's screen rectangle.
///
/// Kept separate from the Win32 calls so the arithmetic -- which is where an
/// off-by-one turns into a click landing on the wrong control -- is testable.
#[must_use]
pub fn map_to_screen(
    fb: (u32, u32),
    frame: (u32, u32),
    rect: (i32, i32, i32, i32),
) -> (i32, i32) {
    let (left, top, right, bottom) = rect;
    let rect_w = (right - left).max(1);
    let rect_h = (bottom - top).max(1);
    let frame_w = i64::from(frame.0.max(1));
    let frame_h = i64::from(frame.1.max(1));
    // The capture and the window rect are normally the same size, but they can
    // disagree by a pixel after a resize, so scale rather than assume.
    let x = left + i32::try_from(i64::from(fb.0) * i64::from(rect_w) / frame_w).unwrap_or(0);
    let y = top + i32::try_from(i64::from(fb.1) * i64::from(rect_h) / frame_h).unwrap_or(0);
    (x.clamp(left, right - 1), y.clamp(top, bottom - 1))
}

/// Normalise a screen point into the 0..=65535 space `SendInput` uses for
/// absolute motion across the whole virtual desktop.
#[must_use]
pub fn normalise(point: (i32, i32), virtual_desktop: (i32, i32, i32, i32)) -> (i32, i32) {
    let (vx, vy, vw, vh) = virtual_desktop;
    let nx = i64::from(point.0 - vx) * 65535 / i64::from((vw - 1).max(1));
    let ny = i64::from(point.1 - vy) * 65535 / i64::from((vh - 1).max(1));
    (nx.clamp(0, 65535) as i32, ny.clamp(0, 65535) as i32)
}

#[cfg(windows)]
pub use windows_impl::{set_dpi_aware, Injector};

#[cfg(windows)]
mod windows_impl {
    use super::{button, keysym, keysym_to_char, keysym_to_vk, map_to_screen, normalise, KeyAction};
    use anyhow::{anyhow, Result};
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, SetFocus, VkKeyScanW, INPUT, INPUT_0, INPUT_KEYBOARD,
        INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEINPUT,
        MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN,
        MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_VIRTUALDESK, MOUSEEVENTF_WHEEL, MOUSE_EVENT_FLAGS,
        VIRTUAL_KEY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetSystemMetrics, GetWindowThreadProcessId, IsIconic,
        SetForegroundWindow, ShowWindow, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN, SW_RESTORE, WHEEL_DELTA,
    };

    /// Without this, `GetWindowRect` and the virtual-screen metrics come back in
    /// scaled coordinates while the capture is in physical pixels, and every
    /// click on a high-DPI display lands short of where it was aimed.
    pub fn set_dpi_aware() {
        // Failure means an older Windows that is already per-monitor aware via
        // the manifest, or that awareness was set already. Neither is fatal.
        unsafe {
            let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    }

    pub struct Injector {
        hwnd: HWND,
        /// Last button mask seen, to turn RFB's level-triggered mask into the
        /// edge-triggered down/up events `SendInput` wants.
        buttons: u8,
    }

    // HWND is a raw pointer, so it is not Send by default. The window handle is
    // just an integer identifier and every use of it here is a Win32 call that
    // is safe from any thread; the connection task owns exactly one Injector.
    unsafe impl Send for Injector {}

    impl Injector {
        #[must_use]
        pub fn new(hwnd: u32) -> Self {
            Self { hwnd: HWND(hwnd as usize as *mut std::ffi::c_void), buttons: 0 }
        }

        /// The window's visible bounds, which is what the capture covers --
        /// `GetWindowRect` would include the invisible resize border and shift
        /// every coordinate by a few pixels.
        fn frame_bounds(&self) -> Result<(i32, i32, i32, i32)> {
            let mut rect = RECT::default();
            unsafe {
                DwmGetWindowAttribute(
                    self.hwnd,
                    DWMWA_EXTENDED_FRAME_BOUNDS,
                    std::ptr::from_mut(&mut rect).cast(),
                    u32::try_from(std::mem::size_of::<RECT>())?,
                )
            }
            .map_err(|e| anyhow!("cannot read window bounds: {e}"))?;
            Ok((rect.left, rect.top, rect.right, rect.bottom))
        }

        fn virtual_desktop() -> (i32, i32, i32, i32) {
            unsafe {
                (
                    GetSystemMetrics(SM_XVIRTUALSCREEN),
                    GetSystemMetrics(SM_YVIRTUALSCREEN),
                    GetSystemMetrics(SM_CXVIRTUALSCREEN),
                    GetSystemMetrics(SM_CYVIRTUALSCREEN),
                )
            }
        }

        /// Raise the mirrored window, if it is not already in front.
        ///
        /// Windows refuses `SetForegroundWindow` from a process that does not
        /// own the foreground, and the documented way around that is to attach
        /// to the foreground thread's input queue for the duration of the call.
        pub fn focus(&self) -> Result<()> {
            unsafe {
                let foreground = GetForegroundWindow();
                if foreground == self.hwnd {
                    return Ok(());
                }
                if IsIconic(self.hwnd).as_bool() {
                    let _ = ShowWindow(self.hwnd, SW_RESTORE);
                }
                let foreground_thread = GetWindowThreadProcessId(foreground, None);
                let this_thread = GetCurrentThreadId();
                let attached = foreground_thread != 0 && foreground_thread != this_thread;
                if attached {
                    let _ = AttachThreadInput(this_thread, foreground_thread, true);
                }
                let raised = SetForegroundWindow(self.hwnd).as_bool();
                if raised {
                    let _ = SetFocus(Some(self.hwnd));
                }
                if attached {
                    let _ = AttachThreadInput(this_thread, foreground_thread, false);
                }
                if raised {
                    Ok(())
                } else {
                    Err(anyhow!("the system refused to raise the window"))
                }
            }
        }

        /// Where a framebuffer coordinate lands on screen right now.
        pub fn screen_point(&self, fb: (u32, u32), frame: (u32, u32)) -> Result<(i32, i32)> {
            Ok(map_to_screen(fb, frame, self.frame_bounds()?))
        }

        pub fn pointer(&mut self, mask: u8, fb: (u32, u32), frame: (u32, u32)) -> Result<()> {
            let point = self.screen_point(fb, frame)?;
            let (nx, ny) = normalise(point, Self::virtual_desktop());
            let mut events = vec![mouse_event(
                MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                nx,
                ny,
                0,
            )];

            let pressed = mask & !self.buttons;
            let released = !mask & self.buttons;
            for (bit, down, up) in [
                (button::LEFT, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                (button::MIDDLE, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
                (button::RIGHT, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            ] {
                if pressed & bit != 0 {
                    events.push(mouse_event(down, nx, ny, 0));
                }
                if released & bit != 0 {
                    events.push(mouse_event(up, nx, ny, 0));
                }
            }

            // RFB has no wheel axis: a scroll is a press of button 4..7. Only
            // the press carries information, so the matching release is dropped.
            let wheel = i32::try_from(WHEEL_DELTA)?;
            for (bit, flags, delta) in [
                (button::WHEEL_UP, MOUSEEVENTF_WHEEL, wheel),
                (button::WHEEL_DOWN, MOUSEEVENTF_WHEEL, -wheel),
                (button::WHEEL_RIGHT, MOUSEEVENTF_HWHEEL, wheel),
                (button::WHEEL_LEFT, MOUSEEVENTF_HWHEEL, -wheel),
            ] {
                if pressed & bit != 0 {
                    events.push(mouse_event(flags, nx, ny, delta));
                }
            }

            self.buttons = mask;
            send(&events)
        }

        pub fn key(&self, down: bool, keysym: u32) -> Result<()> {
            let action = classify(keysym);
            let event = match action {
                KeyAction::Virtual(vk) => key_event(vk, 0, KEYBD_EVENT_FLAGS(0), down),
                KeyAction::Unicode(unit) => key_event(0, unit, KEYEVENTF_UNICODE, down),
                KeyAction::Ignore => return Ok(()),
            };
            send(&[event])
        }

        /// Whether a virtual key is physically down right now. Used by the
        /// tests to check that a key event survived the whole path, without
        /// typing anything into whatever window is focused.
        #[must_use]
        pub fn key_is_down(vk: u16) -> bool {
            // The high bit is the down state; the low bit is a since-last-call
            // toggle that is not wanted here.
            (unsafe { GetAsyncKeyState(i32::from(vk)) } as u16 & 0x8000) != 0
        }

        pub fn cursor_position() -> Result<(i32, i32)> {
            let mut point = POINT::default();
            unsafe { GetCursorPos(&mut point) }?;
            Ok((point.x, point.y))
        }
    }

    /// Decide how to deliver a keysym on the active keyboard layout.
    fn classify(keysym: u32) -> KeyAction {
        if let Some(vk) = keysym_to_vk(keysym) {
            return KeyAction::Virtual(vk);
        }
        let Some(ch) = keysym_to_char(keysym) else { return KeyAction::Ignore };
        let mut units = [0_u16; 2];
        let encoded = ch.encode_utf16(&mut units);
        if encoded.len() == 1 {
            // A key that exists on this layout goes through its virtual key, so
            // that Ctrl and Alt combinations still reach the application.
            let scan = unsafe { VkKeyScanW(encoded[0]) };
            if scan != -1 {
                #[allow(clippy::cast_sign_loss)]
                return KeyAction::Virtual((scan as u16) & 0xFF);
            }
            return KeyAction::Unicode(encoded[0]);
        }
        // Astral-plane characters would need a surrogate pair, which is two
        // events; no keyboard produces them and RFB clients do not send them.
        KeyAction::Ignore
    }

    fn mouse_event(flags: MOUSE_EVENT_FLAGS, x: i32, y: i32, data: i32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: x,
                    dy: y,
                    #[allow(clippy::cast_sign_loss)]
                    mouseData: data as u32,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn key_event(vk: u16, scan: u16, flags: KEYBD_EVENT_FLAGS, down: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: scan,
                    dwFlags: if down { flags } else { flags | KEYEVENTF_KEYUP },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn send(events: &[INPUT]) -> Result<()> {
        let sent =
            unsafe { SendInput(events, i32::try_from(std::mem::size_of::<INPUT>())?) } as usize;
        if sent == events.len() {
            Ok(())
        } else {
            Err(anyhow!("SendInput delivered {sent} of {} events", events.len()))
        }
    }

    // Silences unused-import warnings for the constants referenced only in the
    // keysym table above.
    const _: (u32, u32) = (keysym::F1, keysym::DELETE);
    #[allow(dead_code)]
    type UnusedMessageTypes = (WPARAM, LPARAM);
}

#[cfg(test)]
mod tests {
    use super::{keysym, keysym_to_char, keysym_to_vk, map_to_screen, normalise};

    #[test]
    fn ascii_keysyms_are_their_own_characters() {
        assert_eq!(keysym_to_char(0x41), Some('A'));
        assert_eq!(keysym_to_char(0x7A), Some('z'));
        assert_eq!(keysym_to_char(0x20), Some(' '));
    }

    #[test]
    fn the_unicode_range_is_offset() {
        // U+4E2D, sent by a client typing a CJK character.
        assert_eq!(keysym_to_char(keysym::UNICODE_BASE + 0x4E2D), Some('中'));
    }

    #[test]
    fn function_keysyms_are_not_characters() {
        assert_eq!(keysym_to_char(keysym::RETURN), None);
        assert_eq!(keysym_to_char(keysym::F1), None);
    }

    #[test]
    fn function_keys_map_to_virtual_keys() {
        assert_eq!(keysym_to_vk(keysym::RETURN), Some(0x0D));
        assert_eq!(keysym_to_vk(keysym::F1), Some(0x70));
        assert_eq!(keysym_to_vk(keysym::F12), Some(0x7B));
        assert_eq!(keysym_to_vk(keysym::CONTROL_L), Some(0xA2));
    }

    #[test]
    fn a_mac_clients_meta_lands_on_alt() {
        assert_eq!(keysym_to_vk(keysym::META_L), keysym_to_vk(keysym::ALT_L));
    }

    #[test]
    fn characters_have_no_virtual_key_of_their_own() {
        // Those go through the layout at injection time, not this table.
        assert_eq!(keysym_to_vk(0x41), None);
    }

    #[test]
    fn the_framebuffer_origin_maps_to_the_window_origin() {
        assert_eq!(map_to_screen((0, 0), (800, 600), (100, 50, 900, 650)), (100, 50));
    }

    #[test]
    fn the_far_corner_stays_inside_the_window() {
        // 799 is the last addressable column of an 800-wide framebuffer.
        assert_eq!(map_to_screen((799, 599), (800, 600), (100, 50, 900, 650)), (899, 649));
    }

    #[test]
    fn a_capture_larger_than_the_window_rect_is_scaled_not_truncated() {
        // Can happen for a frame or two around a resize.
        assert_eq!(map_to_screen((800, 0), (1600, 600), (0, 0, 800, 600)), (400, 0));
    }

    #[test]
    fn an_out_of_range_coordinate_is_clamped_into_the_window() {
        assert_eq!(map_to_screen((5000, 5000), (800, 600), (0, 0, 800, 600)), (799, 599));
    }

    #[test]
    fn normalising_spans_the_whole_absolute_range() {
        assert_eq!(normalise((0, 0), (0, 0, 1920, 1080)), (0, 0));
        assert_eq!(normalise((1919, 1079), (0, 0, 1920, 1080)), (65535, 65535));
    }

    #[test]
    fn a_secondary_monitor_left_of_the_primary_normalises_from_the_virtual_origin() {
        // A monitor at negative coordinates is the usual reason absolute mouse
        // positioning lands on the wrong screen.
        assert_eq!(normalise((-1920, 0), (-1920, 0, 3840, 1080)), (0, 0));
    }
}
