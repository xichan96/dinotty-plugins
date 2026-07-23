use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use url::Url;

pub const PREPARED_TTL_SECS: u64 = 5 * 60;
pub const CANDIDATE_TTL_SECS: u64 = 5 * 60;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Locale {
    #[default]
    En,
    Zh,
}

impl std::str::FromStr for Locale {
    type Err = String;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        match value {
            "en" => Ok(Self::En),
            "zh" => Ok(Self::Zh),
            _ => Err("locale must be either en or zh".into()),
        }
    }
}

impl std::fmt::Display for Locale {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::En => "en",
            Self::Zh => "zh",
        })
    }
}

#[derive(Clone, Debug)]
pub struct RuntimePaths {
    pub data_dir: PathBuf,
    pub prepared: PathBuf,
    pub state: PathBuf,
    pub control: PathBuf,
    pub lock: PathBuf,
}

impl RuntimePaths {
    pub fn from_env() -> Result<Self> {
        let raw = std::env::var_os("DINOTTY_PLUGIN_DATA_DIR")
            .context("DINOTTY_PLUGIN_DATA_DIR is required")?;
        let data_dir = PathBuf::from(raw);
        std::fs::create_dir_all(&data_dir).context("create plugin data directory")?;
        protect_path(&data_dir, true)?;
        Ok(Self {
            prepared: data_dir.join("prepared.json"),
            state: data_dir.join("state.json"),
            control: data_dir.join("control.json"),
            lock: data_dir.join("supervisor.lock"),
            data_dir,
        })
    }
}

#[derive(Clone, Debug)]
pub struct HostContext {
    pub origin: Url,
    pub origin_port: u16,
    pub host_target: String,
    pub host_version: String,
    pub host_mode: String,
}

impl HostContext {
    pub fn from_env() -> Result<Self> {
        let raw = std::env::var("DINOTTY_ORIGIN").context("DINOTTY_ORIGIN is required")?;
        let origin = Url::parse(&raw).context("DINOTTY_ORIGIN is not a valid URL")?;
        if origin.scheme() != "http"
            || origin.host_str() != Some("127.0.0.1")
            || origin.port().is_none()
            || origin.username() != ""
            || origin.password().is_some()
            || origin.query().is_some()
            || origin.fragment().is_some()
            || origin.path() != "/"
        {
            bail!("DINOTTY_ORIGIN must be exactly http://127.0.0.1:<port>");
        }
        let origin_port = origin.port().context("DINOTTY_ORIGIN has no port")?;
        Ok(Self {
            origin,
            origin_port,
            host_target: required_env("DINOTTY_HOST_TARGET")?,
            host_version: required_env("DINOTTY_HOST_VERSION")?,
            host_mode: required_env("DINOTTY_HOST_MODE")?,
        })
    }
}

fn required_env(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("{name} is required"))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDigest {
    pub salt: String,
    pub digest: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedState {
    pub schema_version: u32,
    pub generation_id: String,
    pub key: KeyDigest,
    #[serde(default)]
    pub locale: Locale,
    pub created_at: u64,
    pub expires_at: u64,
}

impl PreparedState {
    pub fn is_valid_for(&self, generation: &str) -> bool {
        self.schema_version == 1 && self.generation_id == generation && self.expires_at > now_secs()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeState {
    pub ok: bool,
    pub state: String,
    pub generation_id: Option<String>,
    pub public_url: Option<String>,
    pub edge_location: Option<String>,
    pub started_at: Option<u64>,
    pub library_version: String,
    pub library_commit: String,
    pub gateway: GatewayStatus,
    pub metrics: RuntimeMetrics,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    pub healthy: bool,
    pub authenticated_sessions: usize,
    pub preview_enabled: bool,
    pub origin: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMetrics {
    pub streams_total: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub reconnects: u64,
    pub auth_failures: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicRuntimeStatus {
    pub schema_version: u32,
    pub source: &'static str,
    pub observed_at: u64,
    pub state: String,
    pub connected: bool,
    pub generation_id: Option<String>,
    pub public_url: Option<String>,
    pub edge_location: Option<String>,
    pub started_at: Option<u64>,
    pub gateway: PublicGatewayStatus,
    pub metrics: RuntimeMetrics,
    pub error: Option<PublicStatusError>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicGatewayStatus {
    pub healthy: bool,
    pub authenticated_sessions: usize,
    pub preview_enabled: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicStatusError {
    pub code: &'static str,
    pub message: &'static str,
}

impl RuntimeState {
    pub fn stopped(origin: String) -> Self {
        Self {
            ok: true,
            state: "stopped".into(),
            generation_id: None,
            public_url: None,
            edge_location: None,
            started_at: None,
            library_version: "0.3.1+dinotty-fork".into(),
            library_commit: "baeefc821105eb75d1794e3103efe33ee7f26b47".into(),
            gateway: GatewayStatus {
                origin,
                ..GatewayStatus::default()
            },
            metrics: RuntimeMetrics::default(),
            error: None,
        }
    }

    pub fn public_status(&self) -> PublicRuntimeStatus {
        PublicRuntimeStatus {
            schema_version: 1,
            source: "share-gateway",
            observed_at: now_secs(),
            state: self.state.clone(),
            connected: self.ok && self.state == "connected" && self.gateway.healthy,
            generation_id: self.generation_id.clone(),
            public_url: self.public_url.clone(),
            edge_location: self.edge_location.clone(),
            started_at: self.started_at,
            gateway: PublicGatewayStatus {
                healthy: self.gateway.healthy,
                authenticated_sessions: self.gateway.authenticated_sessions,
                preview_enabled: self.gateway.preview_enabled,
            },
            metrics: self.metrics.clone(),
            error: self.error.as_ref().map(|_| PublicStatusError {
                code: "TUNNEL_ERROR",
                message: "The tunnel reported an error",
            }),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlDescriptor {
    pub schema_version: u32,
    pub port: u16,
    pub capability: String,
    pub generation_id: String,
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let bytes = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_slice(&bytes).with_context(|| format!("parse {}", path.display()))
}

pub fn write_private_json(path: &Path, value: &impl Serialize) -> Result<()> {
    use atomicwrites::{AllowOverwrite, AtomicFile};
    use std::io;

    std::fs::create_dir_all(path.parent().context("state path has no parent")?)?;
    AtomicFile::new(path, AllowOverwrite)
        .write(|file| {
            serde_json::to_writer(file, value).map_err(|error| io::Error::other(error.to_string()))
        })
        .map_err(|error| anyhow::anyhow!("atomically write {}: {error}", path.display()))?;
    protect_path(path, false)?;
    Ok(())
}

pub fn protect_path(path: &Path, directory: bool) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = if directory { 0o700 } else { 0o600 };
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))?;
    }
    #[cfg(not(unix))]
    let _ = (path, directory);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepared_state_without_locale_defaults_to_english() {
        let state: PreparedState = serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "generationId": "generation",
            "key": { "salt": "salt", "digest": "digest" },
            "createdAt": 1,
            "expiresAt": 2
        }))
        .unwrap();

        assert_eq!(state.locale, Locale::En);
    }

    #[test]
    fn locale_parser_accepts_only_supported_values() {
        assert_eq!("en".parse::<Locale>().unwrap(), Locale::En);
        assert_eq!("zh".parse::<Locale>().unwrap(), Locale::Zh);
        assert!("zh-CN".parse::<Locale>().is_err());
    }

    #[test]
    fn public_status_exposes_controls_without_internal_origin_or_raw_errors() {
        let mut state = RuntimeState::stopped("http://127.0.0.1:8999/".into());
        state.ok = false;
        state.state = "error".into();
        state.generation_id = Some("private-generation".into());
        state.error = Some("origin connect 127.0.0.1:8999 failed".into());

        let value = serde_json::to_value(state.public_status()).unwrap();

        assert_eq!(value["source"], "share-gateway");
        assert_eq!(value["error"]["code"], "TUNNEL_ERROR");
        assert_eq!(value["generationId"], "private-generation");
        assert!(value["publicUrl"].is_null());
        assert!(value["gateway"].get("origin").is_none());
        assert!(!value.to_string().contains("127.0.0.1"));
    }
}
