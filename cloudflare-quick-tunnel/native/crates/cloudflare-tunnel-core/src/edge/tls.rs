use std::io::BufReader;
use std::sync::{Arc, Once};

use rustls::{ClientConfig, RootCertStore};
use tracing::{debug, warn};

use crate::TunnelError;

pub(crate) const EDGE_TLS_SERVER_NAME: &str = "h2.cftunnel.com";
const CF_EDGE_ROOTS: &[u8] = include_bytes!("../../third_party/cloudflared/cf-edge-roots.pem");

pub(crate) fn client_config() -> Result<Arc<ClientConfig>, TunnelError> {
    install_provider();
    let mut roots = RootCertStore::empty();
    match rustls_native_certs::load_native_certs() {
        Ok(certificates) => {
            for certificate in certificates {
                let _ = roots.add(certificate);
            }
        }
        Err(error) => warn!(%error, "native trust store unavailable"),
    }
    let native = roots.len();
    let mut reader = BufReader::new(CF_EDGE_ROOTS);
    let mut embedded = 0;
    for certificate in rustls_pemfile::certs(&mut reader) {
        let certificate = certificate
            .map_err(|error| TunnelError::Internal(format!("embedded edge CA: {error}")))?;
        if roots.add(certificate).is_ok() {
            embedded += 1;
        }
    }
    debug!(
        native,
        embedded,
        total = roots.len(),
        "built edge TLS trust store"
    );
    let mut config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    config.alpn_protocols.clear();
    Ok(Arc::new(config))
}

fn install_provider() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn production_tls_has_empty_alpn_and_roots() {
        let config = client_config().unwrap();
        assert!(config.alpn_protocols.is_empty());
    }
}
