use std::time::Duration;

use dinotty_cloudflare_tunnel_core::{QuickTunnelHandle, QuickTunnelManager};
use tokio_util::sync::CancellationToken;

const CONNECTION_TIMEOUT: Duration = Duration::from_secs(45);

pub async fn start(
    gateway_port: u16,
    ha_connections: u8,
    cancellation: CancellationToken,
) -> Result<QuickTunnelHandle, dinotty_cloudflare_tunnel_core::TunnelError> {
    QuickTunnelManager::new(gateway_port)
        .with_ha_connections(ha_connections)
        .with_timeout(CONNECTION_TIMEOUT)
        .start_with_cancel(cancellation)
        .await
}
