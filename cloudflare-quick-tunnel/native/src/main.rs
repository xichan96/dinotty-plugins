mod auth;
mod bridge;
mod control;
mod doctor;
mod gateway;
mod lifetime;
mod state;
mod tunnel;

use std::collections::HashSet;
use std::fs::OpenOptions;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use dinotty_cloudflare_tunnel_core::ReactorState;
use fs2::FileExt;
use serde_json::json;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use auth::{digest_secret, generate_secret, SecurityState};
use control::{ControlRequest, ControlState};
use gateway::GatewayState;
use state::{
    now_secs, read_json, write_private_json, ControlDescriptor, HostContext, Locale, PreparedState,
    RuntimePaths, RuntimeState, PREPARED_TTL_SECS,
};

#[derive(Parser)]
#[command(name = "dinotty-quick-tunnel-supervisor", version)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Version {
        #[arg(long)]
        json: bool,
    },
    Doctor {
        #[arg(long)]
        offline: bool,
        #[arg(long)]
        online: bool,
        #[arg(long)]
        json: bool,
    },
    Prepare {
        #[arg(long)]
        access_key: Option<String>,
        #[arg(long, default_value_t)]
        locale: Locale,
        #[arg(long)]
        json: bool,
    },
    Run {
        #[arg(long)]
        generation: String,
        #[arg(long)]
        json: bool,
    },
    Status {
        #[arg(long)]
        json: bool,
    },
    Stop {
        #[arg(long)]
        generation: String,
        #[arg(long)]
        json: bool,
    },
    RotateKeyPrepare {
        #[arg(long)]
        generation: String,
        #[arg(long)]
        json: bool,
    },
    RotateKeyCommit {
        #[arg(long)]
        generation: String,
        #[arg(long)]
        candidate: String,
        #[arg(long)]
        json: bool,
    },
    RotateKeyCancel {
        #[arg(long)]
        generation: String,
        #[arg(long)]
        candidate: String,
        #[arg(long)]
        json: bool,
    },
    RevokeSessions {
        #[arg(long)]
        generation: String,
        #[arg(long)]
        json: bool,
    },
    SetPreview {
        #[arg(long)]
        generation: String,
        #[arg(long, action = clap::ArgAction::Set)]
        enabled: bool,
        #[arg(long)]
        json: bool,
    },
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();
    if let Err(error) = execute(Cli::parse()).await {
        println!("{}", json!({"ok": false, "error": error.to_string()}));
        std::process::exit(1);
    }
}

async fn execute(cli: Cli) -> Result<()> {
    let paths = RuntimePaths::from_env()?;
    match cli.command {
        Command::Version { .. } => print_json(&json!({
            "ok": true,
            "version": env!("CARGO_PKG_VERSION"),
            "libraryVersion": "0.3.1+dinotty-fork",
            "libraryCommit": "baeefc821105eb75d1794e3103efe33ee7f26b47",
        })),
        Command::Doctor { online, .. } if online => {
            let response = control::send(
                &paths,
                &ControlRequest {
                    command: "doctor-online".into(),
                    generation_id: None,
                    candidate_id: None,
                    enabled: None,
                },
            )
            .await?;
            print_json(&response);
        }
        Command::Doctor { .. } => {
            let host = HostContext::from_env()?;
            print_json(&doctor::offline(&paths, &host).await);
        }
        Command::Prepare {
            access_key, locale, ..
        } => prepare(&paths, access_key, locale).await?,
        Command::Run { generation, .. } => run(paths, generation).await?,
        Command::Status { .. } => status(&paths).await?,
        Command::Stop { generation, .. } => online(&paths, "stop", generation, None, None).await?,
        Command::RotateKeyPrepare { generation, .. } => {
            online(&paths, "rotate-key-prepare", generation, None, None).await?
        }
        Command::RotateKeyCommit {
            generation,
            candidate,
            ..
        } => {
            online(
                &paths,
                "rotate-key-commit",
                generation,
                Some(candidate),
                None,
            )
            .await?
        }
        Command::RotateKeyCancel {
            generation,
            candidate,
            ..
        } => {
            online(
                &paths,
                "rotate-key-cancel",
                generation,
                Some(candidate),
                None,
            )
            .await?
        }
        Command::RevokeSessions { generation, .. } => {
            online(&paths, "revoke-sessions", generation, None, None).await?
        }
        Command::SetPreview {
            generation,
            enabled,
            ..
        } => online(&paths, "set-preview", generation, None, Some(enabled)).await?,
    }
    Ok(())
}

async fn prepare(paths: &RuntimePaths, custom_key: Option<String>, locale: Locale) -> Result<()> {
    let host = HostContext::from_env()?;
    ensure_supported_target(&host.host_target)?;
    if paths.control.exists()
        && control::send(
            paths,
            &ControlRequest {
                command: "status".into(),
                generation_id: None,
                candidate_id: None,
                enabled: None,
            },
        )
        .await
        .is_ok()
    {
        bail!("a supervisor is already running");
    }
    remove_file_if_exists(&paths.control)?;
    let access_key = match custom_key {
        Some(value) => {
            validate_access_key(&value)?;
            zeroize::Zeroizing::new(value)
        }
        None => generate_secret(),
    };
    let generation_id = uuid::Uuid::new_v4().to_string();
    let created_at = now_secs();
    let prepared = PreparedState {
        schema_version: 1,
        generation_id: generation_id.clone(),
        key: digest_secret(&access_key),
        locale,
        created_at,
        expires_at: created_at + PREPARED_TTL_SECS,
    };
    write_private_json(&paths.prepared, &prepared)?;
    write_private_json(
        &paths.state,
        &RuntimeState {
            state: "awaiting_run".into(),
            generation_id: Some(generation_id.clone()),
            ..RuntimeState::stopped(host.origin.to_string())
        },
    )?;
    print_json(&json!({
        "ok": true,
        "generationId": generation_id,
        "accessKey": access_key.as_str(),
        "expiresAt": prepared.expires_at,
    }));
    Ok(())
}

async fn run(paths: RuntimePaths, generation: String) -> Result<()> {
    let host = HostContext::from_env()?;
    ensure_supported_target(&host.host_target)?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&paths.lock)?;
    state::protect_path(&paths.lock, false)?;
    lock.try_lock_exclusive()
        .context("another supervisor owns the instance lock")?;
    let prepared: PreparedState = read_json(&paths.prepared)?;
    if !prepared.is_valid_for(&generation) {
        bail!("prepared state is expired or generation does not match");
    }
    remove_file_if_exists(&paths.prepared)?;

    let security = Arc::new(SecurityState::new(prepared.key));
    let mut initial_runtime = RuntimeState::stopped(host.origin.to_string());
    initial_runtime.state = "requesting_tunnel".into();
    initial_runtime.generation_id = Some(generation.clone());
    initial_runtime.started_at = Some(now_secs());
    initial_runtime.gateway.healthy = true;
    let runtime = Arc::new(RwLock::new(initial_runtime));
    let gateway_state = GatewayState::new(
        host.clone(),
        Arc::clone(&security),
        prepared.locale,
        Arc::clone(&runtime),
    )?;
    let lifetime = CancellationToken::new();
    let gateway_stop = CancellationToken::new();
    let control_stop = CancellationToken::new();
    let tunnel_stop = CancellationToken::new();

    let gateway_listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
    let gateway_port = gateway_listener.local_addr()?.port();
    let gateway_shutdown = gateway_stop.clone();
    let gateway_server_state = gateway_state.clone();
    let gateway_task = tokio::spawn(async move {
        axum::serve(gateway_listener, gateway::router(gateway_server_state))
            .with_graceful_shutdown(gateway_shutdown.cancelled_owned())
            .await
    });

    let control_listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
    let control_port = control_listener.local_addr()?.port();
    let capability = generate_secret().to_string();
    write_private_json(&paths.state, &*runtime.read().await)?;
    write_private_json(
        &paths.control,
        &ControlDescriptor {
            schema_version: 1,
            port: control_port,
            capability: capability.clone(),
            generation_id: generation.clone(),
        },
    )?;
    let control_state = ControlState {
        capability,
        generation_id: generation.clone(),
        gateway: gateway_state.clone(),
        runtime: Arc::clone(&runtime),
        paths: paths.clone(),
        shutdown: lifetime.clone(),
    };
    let control_shutdown = control_stop.clone();
    let control_task = tokio::spawn(async move {
        axum::serve(control_listener, control::router(control_state))
            .with_graceful_shutdown(control_shutdown.cancelled_owned())
            .await
    });
    let gateway_monitor = monitor_service(
        "gateway",
        gateway_task,
        lifetime.clone(),
        Arc::clone(&runtime),
        paths.clone(),
    );
    let control_monitor = monitor_service(
        "control",
        control_task,
        lifetime.clone(),
        Arc::clone(&runtime),
        paths.clone(),
    );
    let host_lifetime = lifetime::HostLifetime::watch(lifetime.clone());

    let tunnel_start = tunnel::start(gateway_port, 2, tunnel_stop.clone());
    tokio::pin!(tunnel_start);
    let start_result = tokio::select! {
        result = &mut tunnel_start => result,
        () = lifetime.cancelled() => {
            tunnel_stop.cancel();
            tunnel_start.await
        }
    };
    let handle = match start_result {
        Ok(handle) => handle,
        Err(dinotty_cloudflare_tunnel_core::TunnelError::Shutdown) if lifetime.is_cancelled() => {
            control_stop.cancel();
            gateway_stop.cancel();
            tunnel_stop.cancel();
            security.revoke_all().await;
            gateway_state.revoke_live_sessions();
            let _ = gateway_monitor.await;
            let _ = control_monitor.await;
            remove_file_if_exists(&paths.control)?;
            let stopped = RuntimeState::stopped(host.origin.to_string());
            write_private_json(&paths.state, &stopped)?;
            return Ok(());
        }
        Err(error) => {
            let mut state = runtime.write().await;
            state.ok = false;
            state.state = "error".into();
            state.error = Some(format!("tunnel startup failed: {error}"));
            state.gateway.healthy = false;
            write_private_json(&paths.state, &*state)?;
            lifetime.cancel();
            tunnel_stop.cancel();
            control_stop.cancel();
            gateway_stop.cancel();
            let _ = gateway_monitor.await;
            let _ = control_monitor.await;
            remove_file_if_exists(&paths.control)?;
            return Err(error.into());
        }
    };
    gateway_state.set_public_url(&handle.url).await?;
    verify_gateway_denies_unauthenticated(gateway_port, &handle.url).await?;
    {
        let mut state = runtime.write().await;
        state.state = "connected".into();
        state.public_url = Some(handle.url.clone());
        state.edge_location = Some(handle.location.clone());
        write_private_json(&paths.state, &*state)?;
    }
    let mut reactor_events = handle.subscribe_reactor_events();
    let reactor_count = handle.reactor_count();
    let mut exhausted = HashSet::new();
    let mut metrics_tick = tokio::time::interval(Duration::from_secs(2));
    loop {
        tokio::select! {
            () = lifetime.cancelled() => break,
            event = reactor_events.recv() => {
                if let Ok(event) = event {
                    match event.state {
                        ReactorState::Exhausted => { exhausted.insert(event.conn_index); }
                        ReactorState::Connected => { exhausted.remove(&event.conn_index); }
                        _ => {}
                    }
                    if all_reactors_exhausted(&exhausted, reactor_count) {
                        let mut state = runtime.write().await;
                        state.ok = false;
                        state.state = "error".into();
                        state.error = Some("all tunnel reactors exhausted their reconnect budget".into());
                        write_private_json(&paths.state, &*state)?;
                        lifetime.cancel();
                    }
                }
            }
            _ = metrics_tick.tick() => {
                let metrics = handle.metrics();
                let mut state = runtime.write().await;
                state.metrics.streams_total = metrics.streams_total;
                state.metrics.bytes_in = metrics.bytes_in;
                state.metrics.bytes_out = metrics.bytes_out;
                state.metrics.reconnects = metrics.reconnects;
                state.metrics.auth_failures = security.auth_failures().await;
                state.gateway.authenticated_sessions = security.session_count().await;
                write_private_json(&paths.state, &*state)?;
            }
        }
    }

    let shutdown_grace = if host_lifetime.ended_abruptly() {
        Duration::from_secs(1)
    } else {
        Duration::from_secs(10)
    };
    let shutdown_deadline = std::time::Instant::now() + shutdown_grace;
    {
        let mut state = runtime.write().await;
        if state.state != "error" {
            state.state = "draining".into();
            write_private_json(&paths.state, &*state)?;
        }
    }
    control_stop.cancel();
    let tunnel_shutdown = handle.shutdown_until(shutdown_deadline).await;
    security.revoke_all().await;
    gateway_state.revoke_live_sessions();
    gateway_stop.cancel();
    tunnel_stop.cancel();
    let remaining = shutdown_deadline.saturating_duration_since(std::time::Instant::now());
    let _ = tokio::time::timeout(remaining, gateway_monitor).await;
    let remaining = shutdown_deadline.saturating_duration_since(std::time::Instant::now());
    let _ = tokio::time::timeout(remaining, control_monitor).await;
    remove_file_if_exists(&paths.control)?;
    {
        let mut state = runtime.write().await;
        state.gateway.healthy = false;
        state.gateway.authenticated_sessions = 0;
        state.gateway.preview_enabled = false;
        if state.state != "error" {
            *state = RuntimeState::stopped(host.origin.to_string());
        }
        write_private_json(&paths.state, &*state)?;
    }
    drop(lock);
    tunnel_shutdown?;
    Ok(())
}

fn monitor_service(
    name: &'static str,
    service: tokio::task::JoinHandle<std::io::Result<()>>,
    cancellation: CancellationToken,
    runtime: Arc<RwLock<RuntimeState>>,
    paths: RuntimePaths,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let result = service.await;
        if cancellation.is_cancelled() {
            return;
        }
        {
            let mut state = runtime.write().await;
            state.ok = false;
            state.state = "error".into();
            state.error = Some(match result {
                Ok(Ok(())) => format!("{name} service stopped unexpectedly"),
                Ok(Err(error)) => format!("{name} service failed: {error}"),
                Err(error) => format!("{name} service task failed: {error}"),
            });
            state.gateway.healthy = false;
            let _ = write_private_json(&paths.state, &*state);
        }
        cancellation.cancel();
    })
}

async fn verify_gateway_denies_unauthenticated(port: u16, public_url: &str) -> Result<()> {
    let host = url::Url::parse(public_url)?
        .host_str()
        .context("public URL has no host")?
        .to_string();
    let response = reqwest::Client::new()
        .get(format!("http://127.0.0.1:{port}/api/settings"))
        .header("host", host)
        .send()
        .await?;
    if response.status() != reqwest::StatusCode::UNAUTHORIZED {
        bail!("gateway unauthenticated self-test failed");
    }
    Ok(())
}

async fn status(paths: &RuntimePaths) -> Result<()> {
    let request = ControlRequest {
        command: "status".into(),
        generation_id: None,
        candidate_id: None,
        enabled: None,
    };
    match control::send(paths, &request).await {
        Ok(value) => print_json(&value),
        Err(_) if paths.state.exists() => {
            let mut state: RuntimeState = read_json(&paths.state)?;
            if !matches!(state.state.as_str(), "stopped" | "error" | "awaiting_run") {
                state.ok = false;
                state.state = "stale".into();
                state.error = Some("supervisor control channel is not reachable".into());
            }
            print_json(&state);
        }
        Err(_) => print_json(&RuntimeState::stopped("unknown".into())),
    }
    Ok(())
}

async fn online(
    paths: &RuntimePaths,
    command: &str,
    generation: String,
    candidate_id: Option<String>,
    enabled: Option<bool>,
) -> Result<()> {
    let value = control::send(
        paths,
        &ControlRequest {
            command: command.into(),
            generation_id: Some(generation),
            candidate_id,
            enabled,
        },
    )
    .await?;
    print_json(&value);
    Ok(())
}

fn ensure_supported_target(target: &str) -> Result<()> {
    if matches!(
        target,
        "windows-x86_64" | "linux-x86_64" | "linux-aarch64" | "macos-x86_64" | "macos-aarch64"
    ) {
        Ok(())
    } else {
        bail!("unsupported host target: {target}")
    }
}

fn validate_access_key(value: &str) -> Result<()> {
    if !(12..=256).contains(&value.len()) {
        bail!("access key must contain 12 to 256 characters");
    }
    if value.chars().any(char::is_control) {
        bail!("access key must not contain control characters");
    }
    Ok(())
}

fn remove_file_if_exists(path: &std::path::Path) -> Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn all_reactors_exhausted(exhausted: &HashSet<u8>, reactor_count: usize) -> bool {
    reactor_count > 0 && exhausted.len() >= reactor_count
}

fn print_json(value: &impl serde::Serialize) {
    println!(
        "{}",
        serde_json::to_string(value).unwrap_or_else(|_| "{\"ok\":false}".into())
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exhaustion_uses_actual_reactor_count() {
        let mut exhausted = HashSet::new();
        assert!(!all_reactors_exhausted(&exhausted, 1));
        exhausted.insert(0);
        assert!(all_reactors_exhausted(&exhausted, 1));
        assert!(!all_reactors_exhausted(&exhausted, 2));
        exhausted.insert(1);
        assert!(all_reactors_exhausted(&exhausted, 2));
    }
}
