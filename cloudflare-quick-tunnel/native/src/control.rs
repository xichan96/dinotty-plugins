use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::gateway::GatewayState;
use crate::state::{read_json, write_private_json, ControlDescriptor, RuntimePaths, RuntimeState};

#[derive(Clone)]
pub struct ControlState {
    pub capability: String,
    pub generation_id: String,
    pub gateway: GatewayState,
    pub runtime: Arc<RwLock<RuntimeState>>,
    pub paths: RuntimePaths,
    pub shutdown: CancellationToken,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlRequest {
    pub command: String,
    #[serde(default)]
    pub generation_id: Option<String>,
    #[serde(default)]
    pub candidate_id: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

pub fn router(state: ControlState) -> Router {
    Router::new()
        .route("/control", post(handle))
        .with_state(state)
}

async fn handle(
    State(state): State<ControlState>,
    headers: HeaderMap,
    Json(request): Json<ControlRequest>,
) -> Response {
    if !authorized(&headers, &state.capability) {
        return error(StatusCode::UNAUTHORIZED, "control capability rejected");
    }
    if request.command != "status"
        && request.command != "doctor-online"
        && request.generation_id.as_deref() != Some(&state.generation_id)
    {
        return error(StatusCode::CONFLICT, "generation mismatch");
    }
    match request.command.as_str() {
        "status" => Json(state.runtime.read().await.clone()).into_response(),
        "stop" => {
            state.gateway.security.revoke_all().await;
            state.gateway.revoke_live_sessions();
            state.shutdown.cancel();
            ok(serde_json::json!({"state": "stopping"}))
        }
        "rotate-key-prepare" => {
            let prepared = state.gateway.security.prepare_rotation().await;
            ok(serde_json::to_value(prepared).unwrap())
        }
        "rotate-key-commit" => {
            let Some(candidate) = request.candidate_id.as_deref() else {
                return error(StatusCode::BAD_REQUEST, "candidate is required");
            };
            match state.gateway.security.commit_rotation(candidate).await {
                Ok(()) => {
                    state.gateway.revoke_live_sessions();
                    ok(serde_json::json!({"committed": true, "candidateId": candidate}))
                }
                Err(error_value) => error(StatusCode::CONFLICT, &error_value.to_string()),
            }
        }
        "rotate-key-cancel" => {
            let Some(candidate) = request.candidate_id.as_deref() else {
                return error(StatusCode::BAD_REQUEST, "candidate is required");
            };
            match state.gateway.security.cancel_rotation(candidate).await {
                Ok(()) => ok(serde_json::json!({"cancelled": true})),
                Err(error_value) => error(StatusCode::CONFLICT, &error_value.to_string()),
            }
        }
        "revoke-sessions" => {
            state.gateway.security.revoke_all().await;
            state.gateway.revoke_live_sessions();
            ok(serde_json::json!({"revoked": true}))
        }
        "set-preview" => {
            let enabled = request.enabled.unwrap_or(false);
            state
                .gateway
                .preview_enabled
                .store(enabled, Ordering::Relaxed);
            let mut runtime = state.runtime.write().await;
            runtime.gateway.preview_enabled = enabled;
            let _ = write_private_json(&state.paths.state, &*runtime);
            ok(serde_json::json!({"previewEnabled": enabled}))
        }
        "doctor-online" => ok(serde_json::json!({
            "ok": true,
            "control": "reachable",
            "gateway": state.runtime.read().await.gateway,
        })),
        _ => error(StatusCode::BAD_REQUEST, "unknown control command"),
    }
}

fn authorized(headers: &HeaderMap, capability: &str) -> bool {
    let Some(raw) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    let Some(candidate) = raw.strip_prefix("Bearer ") else {
        return false;
    };
    candidate.as_bytes().ct_eq(capability.as_bytes()).into()
}

fn ok(value: serde_json::Value) -> Response {
    Json(serde_json::json!({"ok": true, "result": value})).into_response()
}

fn error(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(serde_json::json!({"ok": false, "error": message})),
    )
        .into_response()
}

pub async fn send(
    paths: &RuntimePaths,
    request: &ControlRequest,
) -> anyhow::Result<serde_json::Value> {
    let descriptor: ControlDescriptor = read_json(&paths.control)?;
    if descriptor.schema_version != 1 {
        anyhow::bail!("unsupported control descriptor");
    }
    let response = reqwest::Client::new()
        .post(format!("http://127.0.0.1:{}/control", descriptor.port))
        .bearer_auth(&descriptor.capability)
        .json(request)
        .send()
        .await?;
    let status = response.status();
    let value: serde_json::Value = response.json().await?;
    if !status.is_success() {
        anyhow::bail!(
            "{}",
            value
                .get("error")
                .and_then(|value| value.as_str())
                .unwrap_or("control request failed")
        );
    }
    Ok(value)
}
