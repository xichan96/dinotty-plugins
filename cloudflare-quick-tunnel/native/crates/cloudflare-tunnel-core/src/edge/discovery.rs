use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use hickory_resolver::config::{NameServerConfigGroup, ResolverConfig, ResolverOpts};
use hickory_resolver::TokioAsyncResolver;
use rand::Rng;
use tokio::sync::RwLock;
use tracing::warn;

use crate::TunnelError;

pub(crate) const SRV_NAME: &str = "_v2-origintunneld._tcp.argotunnel.com";
const DOT_SERVER_NAME: &str = "cloudflare-dns.com";
const DOT_SERVER_ADDR: &str = "1.1.1.1:853";
const CACHE_TTL: Duration = Duration::from_secs(3600);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct EdgeAddr {
    pub socket: SocketAddr,
}

#[derive(Clone)]
pub(crate) struct EdgeRegistry {
    cache: Arc<RwLock<Option<CachedEdges>>>,
}

struct CachedEdges {
    expires_at: Instant,
    targets: Vec<Target>,
}

impl EdgeRegistry {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn candidates(&self) -> Result<Vec<EdgeAddr>, TunnelError> {
        if let Some(cached) = self.cache.read().await.as_ref() {
            if cached.expires_at > Instant::now() {
                return Ok(order_targets(cached.targets.clone(), &mut rand::rng()));
            }
        }
        let targets = discover().await?;
        let edges = order_targets(targets.clone(), &mut rand::rng());
        *self.cache.write().await = Some(CachedEdges {
            expires_at: Instant::now() + CACHE_TTL,
            targets,
        });
        Ok(edges)
    }
}

#[derive(Clone, Debug)]
struct Target {
    priority: u16,
    weight: u16,
    addresses: Vec<EdgeAddr>,
}

async fn discover() -> Result<Vec<Target>, TunnelError> {
    let system = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());
    match resolve(&system).await {
        Ok(targets) if !targets.is_empty() => return Ok(targets),
        Ok(_) => warn!("system resolver returned no tunnel edges; using DoT fallback"),
        Err(error) => warn!(%error, "system SRV lookup failed; using DoT fallback"),
    }
    let resolver = dot_resolver()?;
    let targets = resolve(&resolver).await?;
    if targets.is_empty() {
        return Err(TunnelError::Discovery(
            "SRV lookup returned no usable addresses".into(),
        ));
    }
    Ok(targets)
}

async fn resolve(resolver: &TokioAsyncResolver) -> Result<Vec<Target>, TunnelError> {
    let records = resolver
        .srv_lookup(SRV_NAME)
        .await
        .map_err(|error| TunnelError::Discovery(format!("SRV {SRV_NAME}: {error}")))?;
    let mut targets = Vec::new();
    for record in records.iter() {
        let host = record.target().to_utf8();
        let host = host.trim_end_matches('.');
        match resolver.lookup_ip(host).await {
            Ok(ips) => targets.push(Target {
                priority: record.priority(),
                weight: record.weight(),
                addresses: ips
                    .iter()
                    .map(|ip| EdgeAddr {
                        socket: SocketAddr::new(ip, record.port()),
                    })
                    .collect(),
            }),
            Err(error) => warn!(host, %error, "edge target lookup failed"),
        }
    }
    Ok(targets)
}

fn order_targets<R: Rng + ?Sized>(targets: Vec<Target>, rng: &mut R) -> Vec<EdgeAddr> {
    let mut priorities: BTreeMap<u16, Vec<Target>> = BTreeMap::new();
    for target in targets {
        priorities.entry(target.priority).or_default().push(target);
    }
    let mut output = Vec::new();
    for (_, mut group) in priorities {
        while !group.is_empty() {
            let total: u32 = group.iter().map(|target| target.weight as u32).sum();
            let index = if total == 0 {
                rng.random_range(0..group.len())
            } else {
                let mut choice = rng.random_range(0..total);
                let mut selected = 0;
                for (index, target) in group.iter().enumerate() {
                    if choice < target.weight as u32 {
                        selected = index;
                        break;
                    }
                    choice -= target.weight as u32;
                }
                selected
            };
            output.extend(interleave_families(group.swap_remove(index).addresses));
        }
    }
    output
}

fn interleave_families(input: Vec<EdgeAddr>) -> Vec<EdgeAddr> {
    let mut v4 = input.iter().copied().filter(|edge| edge.socket.is_ipv4());
    let mut v6 = input.iter().copied().filter(|edge| edge.socket.is_ipv6());
    let start_v6 = input.first().is_some_and(|edge| edge.socket.is_ipv6());
    let mut output = Vec::with_capacity(input.len());
    loop {
        let pair = if start_v6 {
            [v6.next(), v4.next()]
        } else {
            [v4.next(), v6.next()]
        };
        let mut added = false;
        for item in pair.into_iter().flatten() {
            output.push(item);
            added = true;
        }
        if !added {
            break;
        }
    }
    output
}

fn dot_resolver() -> Result<TokioAsyncResolver, TunnelError> {
    let addr: SocketAddr = DOT_SERVER_ADDR
        .parse()
        .map_err(|error| TunnelError::Discovery(format!("DoT address: {error}")))?;
    let nameservers = NameServerConfigGroup::from_ips_tls(
        &[addr.ip()],
        addr.port(),
        DOT_SERVER_NAME.into(),
        true,
    );
    let mut options = ResolverOpts::default();
    options.timeout = Duration::from_secs(10);
    Ok(TokioAsyncResolver::tokio(
        ResolverConfig::from_parts(None, vec![], nameservers),
        options,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{rngs::StdRng, SeedableRng};
    use std::net::IpAddr;

    fn edge(ip: &str) -> EdgeAddr {
        EdgeAddr {
            socket: SocketAddr::new(ip.parse().unwrap(), 7844),
        }
    }

    #[test]
    fn priority_precedes_weight_and_addresses_are_interleaved() {
        let targets = vec![
            Target {
                priority: 20,
                weight: 100,
                addresses: vec![edge("192.0.2.20")],
            },
            Target {
                priority: 10,
                weight: 1,
                addresses: vec![edge("192.0.2.10"), edge("2001:db8::10"), edge("192.0.2.11")],
            },
        ];
        let ordered = order_targets(targets, &mut StdRng::seed_from_u64(1));
        assert_eq!(
            ordered[0].socket.ip(),
            "192.0.2.10".parse::<IpAddr>().unwrap()
        );
        assert!(ordered[1].socket.is_ipv6());
        assert_eq!(
            ordered.last().unwrap().socket.ip(),
            "192.0.2.20".parse::<IpAddr>().unwrap()
        );
    }
}
