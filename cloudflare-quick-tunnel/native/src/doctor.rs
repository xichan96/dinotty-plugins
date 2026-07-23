use serde::Serialize;

use crate::state::{HostContext, RuntimePaths};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub ok: bool,
    pub host_target: Check,
    pub data_directory: Check,
    pub origin: Check,
    pub lifetime_pipe: Check,
}

#[derive(Debug, Serialize)]
pub struct Check {
    pub ok: bool,
    pub detail: String,
}

pub async fn offline(paths: &RuntimePaths, host: &HostContext) -> DoctorReport {
    let origin_reachable = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        tokio::net::TcpStream::connect(("127.0.0.1", host.origin_port)),
    )
    .await
    .is_ok_and(|result| result.is_ok());
    DoctorReport {
        ok: origin_reachable,
        host_target: Check {
            ok: matches!(
                host.host_target.as_str(),
                "windows-x86_64"
                    | "linux-x86_64"
                    | "linux-aarch64"
                    | "macos-x86_64"
                    | "macos-aarch64"
            ),
            detail: format!(
                "{}; Dinotty {}; mode {}",
                host.host_target, host.host_version, host.host_mode
            ),
        },
        data_directory: Check {
            ok: paths.data_dir.is_dir(),
            detail: paths.data_dir.display().to_string(),
        },
        origin: Check {
            ok: origin_reachable,
            detail: if origin_reachable {
                "loopback origin reachable"
            } else {
                "loopback origin unavailable"
            }
            .into(),
        },
        lifetime_pipe: Check {
            ok: true,
            detail: "validated when run watches the stdin lease and Dinotty parent PID".into(),
        },
    }
}
