use std::net::SocketAddr;
use std::sync::Arc;

use uuid::Uuid;

#[derive(Debug, Clone)]
pub(crate) struct TunnelAuth {
    pub account_tag: String,
    pub tunnel_secret: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct RegistrationContext {
    pub tunnel_id: Uuid,
    pub auth: TunnelAuth,
    pub connector_id: [u8; 16],
    pub hostname: Arc<str>,
    pub gateway_addr: SocketAddr,
    pub client_version: Arc<str>,
}

impl RegistrationContext {
    pub fn new(
        tunnel_id: Uuid,
        auth: TunnelAuth,
        hostname: String,
        gateway_addr: SocketAddr,
        client_version: &str,
    ) -> Self {
        Self {
            tunnel_id,
            auth,
            connector_id: *Uuid::new_v4().as_bytes(),
            hostname: hostname.into(),
            gateway_addr,
            client_version: client_version.into(),
        }
    }

    pub fn connection_options(
        &self,
        origin_local_ip: Option<std::net::IpAddr>,
        previous_attempts: u32,
    ) -> ConnectionOptions {
        ConnectionOptions {
            client_id: self.connector_id,
            features: vec!["serialized_headers".into()],
            version: self.client_version.to_string(),
            arch: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
            origin_local_ip: origin_local_ip
                .map(|ip| ip.to_string().into_bytes())
                .unwrap_or_default(),
            replace_existing: false,
            compression_quality: 0,
            num_previous_attempts: previous_attempts.min(u8::MAX as u32) as u8,
        }
    }

    pub fn local_configuration(&self) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "ingress": [
                { "hostname": self.hostname.as_ref(), "service": format!("http://{}", self.gateway_addr) },
                { "service": "http_status:404" }
            ],
            "warp-routing": { "enabled": false }
        }))
        .expect("static local configuration serializes")
    }
}

#[derive(Debug, Clone)]
pub(crate) struct ConnectionOptions {
    pub client_id: [u8; 16],
    pub features: Vec<String>,
    pub version: String,
    pub arch: String,
    pub origin_local_ip: Vec<u8>,
    pub replace_existing: bool,
    pub compression_quality: u8,
    pub num_previous_attempts: u8,
}

#[derive(Debug, Clone)]
pub(crate) struct RegistrationDetails {
    pub uuid: Uuid,
    pub location: String,
    pub tunnel_is_remotely_managed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> RegistrationContext {
        RegistrationContext::new(
            Uuid::nil(),
            TunnelAuth {
                account_tag: "a".into(),
                tunnel_secret: vec![1],
            },
            "unit.trycloudflare.com".into(),
            "127.0.0.1:8080".parse().unwrap(),
            "test/1",
        )
    }

    #[test]
    fn connector_id_is_stable_and_attempts_saturate() {
        let c = context();
        let first = c.connection_options(Some("127.0.0.1".parse().unwrap()), 0);
        let retry = c.connection_options(None, 999);
        assert_eq!(first.client_id, retry.client_id);
        assert!(!first.replace_existing);
        assert_eq!(retry.num_previous_attempts, u8::MAX);
        assert_eq!(first.features, ["serialized_headers"]);
    }

    #[test]
    fn local_configuration_only_targets_gateway() {
        let c = context();
        let value: serde_json::Value = serde_json::from_slice(&c.local_configuration()).unwrap();
        assert_eq!(value["ingress"][0]["hostname"], "unit.trycloudflare.com");
        assert_eq!(value["ingress"][0]["service"], "http://127.0.0.1:8080");
        assert_eq!(value["ingress"][1]["service"], "http_status:404");
    }
}
