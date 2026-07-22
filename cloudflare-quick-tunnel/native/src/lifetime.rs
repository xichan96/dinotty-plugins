use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

pub struct HostLifetime {
    abrupt: Arc<AtomicBool>,
}

impl HostLifetime {
    pub fn watch(cancellation: CancellationToken) -> Self {
        let abrupt = Arc::new(AtomicBool::new(false));
        watch_stdin(cancellation.clone(), Arc::clone(&abrupt));
        watch_parent(cancellation, Arc::clone(&abrupt));
        Self { abrupt }
    }

    pub fn ended_abruptly(&self) -> bool {
        self.abrupt.load(Ordering::Acquire)
    }
}

fn watch_stdin(cancellation: CancellationToken, abrupt: Arc<AtomicBool>) {
    std::thread::Builder::new()
        .name("dinotty-stdin-lease".into())
        .spawn(move || {
            use std::io::BufRead;

            let mut frame = String::new();
            let graceful = match std::io::stdin().lock().read_line(&mut frame) {
                Ok(0) => {
                    tracing::warn!("host lifetime pipe reached EOF");
                    false
                }
                Ok(_) => {
                    let valid = serde_json::from_str::<serde_json::Value>(&frame)
                        .ok()
                        .and_then(|value| {
                            value
                                .get("type")
                                .and_then(|value| value.as_str())
                                .map(str::to_string)
                        })
                        .as_deref()
                        == Some("shutdown");
                    if !valid {
                        tracing::warn!("invalid lifetime frame; failing closed");
                    }
                    valid
                }
                Err(error) => {
                    tracing::warn!(%error, "host lifetime pipe failed");
                    false
                }
            };
            if !graceful {
                abrupt.store(true, Ordering::Release);
            }
            cancellation.cancel();
        })
        .expect("spawn stdin lifetime watcher");
}

fn parent_pid() -> Option<u32> {
    std::env::var("DINOTTY_PARENT_PID").ok()?.parse().ok()
}

#[cfg(windows)]
fn watch_parent(cancellation: CancellationToken, abrupt: Arc<AtomicBool>) {
    use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject, INFINITE};

    const SYNCHRONIZE: u32 = 0x0010_0000;

    let Some(pid) = parent_pid() else {
        tracing::warn!("DINOTTY_PARENT_PID is unavailable; relying on stdin lease");
        return;
    };
    std::thread::Builder::new()
        .name("dinotty-parent-watch".into())
        .spawn(move || unsafe {
            let handle = OpenProcess(SYNCHRONIZE, 0, pid);
            if handle.is_null() {
                tracing::warn!(pid, "Dinotty parent is unavailable; failing closed");
                abrupt.store(true, Ordering::Release);
                cancellation.cancel();
                return;
            }
            let result = WaitForSingleObject(handle, INFINITE);
            CloseHandle(handle);
            if result == WAIT_OBJECT_0 {
                tracing::warn!(pid, "Dinotty parent process exited");
                abrupt.store(true, Ordering::Release);
                cancellation.cancel();
            } else {
                tracing::warn!(pid, result, "failed while waiting for Dinotty parent");
                abrupt.store(true, Ordering::Release);
                cancellation.cancel();
            }
        })
        .expect("spawn parent lifetime watcher");
}

#[cfg(unix)]
fn watch_parent(cancellation: CancellationToken, abrupt: Arc<AtomicBool>) {
    use std::time::Duration;

    let Some(expected_pid) = parent_pid() else {
        tracing::warn!("DINOTTY_PARENT_PID is unavailable; relying on stdin lease");
        return;
    };
    let initial_pid = unsafe { libc::getppid() } as u32;
    if initial_pid != expected_pid {
        tracing::warn!(
            expected_pid,
            initial_pid,
            "Dinotty parent is unavailable; failing closed"
        );
        abrupt.store(true, Ordering::Release);
        cancellation.cancel();
        return;
    }
    std::thread::Builder::new()
        .name("dinotty-parent-watch".into())
        .spawn(move || {
            while !cancellation.is_cancelled() {
                std::thread::sleep(Duration::from_millis(200));
                if unsafe { libc::getppid() } as u32 != initial_pid {
                    tracing::warn!(initial_pid, "Dinotty parent process exited");
                    abrupt.store(true, Ordering::Release);
                    cancellation.cancel();
                    return;
                }
            }
        })
        .expect("spawn parent lifetime watcher");
}
