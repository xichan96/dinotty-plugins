use std::collections::HashMap;

use base64::Engine;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

use crate::state::{now_secs, KeyDigest, CANDIDATE_TTL_SECS};

pub const SESSION_TTL_SECS: u64 = 12 * 60 * 60;
pub const MAX_SESSIONS: usize = 32;

pub fn generate_secret() -> Zeroizing<String> {
    let mut bytes = Zeroizing::new(vec![0_u8; 32]);
    rand::rng().fill_bytes(&mut bytes);
    Zeroizing::new(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&*bytes))
}

pub fn digest_secret(secret: &str) -> KeyDigest {
    let mut salt = [0_u8; 32];
    rand::rng().fill_bytes(&mut salt);
    let digest = hash_with_salt(&salt, secret.as_bytes());
    KeyDigest {
        salt: base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(salt),
        digest: base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest),
    }
}

pub fn verify_secret(record: &KeyDigest, candidate: &str) -> bool {
    let Ok(salt) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(&record.salt) else {
        return false;
    };
    let Ok(expected) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(&record.digest)
    else {
        return false;
    };
    let actual = hash_with_salt(&salt, candidate.as_bytes());
    expected.as_slice().ct_eq(actual.as_slice()).into()
}

fn hash_with_salt(salt: &[u8], secret: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(secret);
    hasher.finalize().to_vec()
}

#[derive(Clone, Debug)]
pub struct Session {
    pub expires_at: u64,
}

#[derive(Clone, Debug)]
pub struct CandidateKey {
    pub id: String,
    pub key: KeyDigest,
    pub expires_at: u64,
}

#[derive(Debug)]
pub struct SecurityData {
    pub active_key: KeyDigest,
    pub sessions: HashMap<Vec<u8>, Session>,
    pub candidate: Option<CandidateKey>,
    pub last_committed_candidate: Option<String>,
    pub auth_failures: u64,
}

#[derive(Debug)]
pub struct SecurityState(pub Mutex<SecurityData>);

impl SecurityState {
    pub fn new(active_key: KeyDigest) -> Self {
        Self(Mutex::new(SecurityData {
            active_key,
            sessions: HashMap::new(),
            candidate: None,
            last_committed_candidate: None,
            auth_failures: 0,
        }))
    }

    pub async fn login(&self, key: &str) -> Result<String, LoginError> {
        let mut data = self.0.lock().await;
        data.sessions
            .retain(|_, session| session.expires_at > now_secs());
        if !verify_secret(&data.active_key, key) {
            data.auth_failures = data.auth_failures.saturating_add(1);
            return Err(LoginError::Invalid);
        }
        if data.sessions.len() >= MAX_SESSIONS {
            return Err(LoginError::SessionLimit);
        }
        let raw = generate_secret();
        let digest = Sha256::digest(raw.as_bytes()).to_vec();
        data.sessions.insert(
            digest,
            Session {
                expires_at: now_secs() + SESSION_TTL_SECS,
            },
        );
        Ok(raw.to_string())
    }

    pub async fn validate_session(&self, raw: &str) -> bool {
        let digest = Sha256::digest(raw.as_bytes()).to_vec();
        let mut data = self.0.lock().await;
        data.sessions
            .retain(|_, session| session.expires_at > now_secs());
        data.sessions.contains_key(&digest)
    }

    pub async fn logout(&self, raw: &str) {
        let digest = Sha256::digest(raw.as_bytes()).to_vec();
        self.0.lock().await.sessions.remove(&digest);
    }

    pub async fn revoke_all(&self) {
        self.0.lock().await.sessions.clear();
    }

    pub async fn session_count(&self) -> usize {
        let mut data = self.0.lock().await;
        data.sessions
            .retain(|_, session| session.expires_at > now_secs());
        data.sessions.len()
    }

    pub async fn prepare_rotation(&self) -> RotationPrepared {
        let secret = generate_secret();
        let candidate_id = uuid::Uuid::new_v4().to_string();
        self.0.lock().await.candidate = Some(CandidateKey {
            id: candidate_id.clone(),
            key: digest_secret(&secret),
            expires_at: now_secs() + CANDIDATE_TTL_SECS,
        });
        RotationPrepared {
            candidate_id,
            access_key: secret,
            expires_at: now_secs() + CANDIDATE_TTL_SECS,
        }
    }

    pub async fn commit_rotation(&self, candidate_id: &str) -> Result<(), RotationError> {
        let mut data = self.0.lock().await;
        if data.last_committed_candidate.as_deref() == Some(candidate_id) {
            return Ok(());
        }
        let candidate = data.candidate.take().ok_or(RotationError::Missing)?;
        if candidate.id != candidate_id {
            data.candidate = Some(candidate);
            return Err(RotationError::Mismatch);
        }
        if candidate.expires_at <= now_secs() {
            return Err(RotationError::Expired);
        }
        data.active_key = candidate.key;
        data.sessions.clear();
        data.last_committed_candidate = Some(candidate_id.to_string());
        Ok(())
    }

    pub async fn cancel_rotation(&self, candidate_id: &str) -> Result<(), RotationError> {
        let mut data = self.0.lock().await;
        match data.candidate.as_ref() {
            Some(candidate) if candidate.id == candidate_id => {
                data.candidate = None;
                Ok(())
            }
            Some(_) => Err(RotationError::Mismatch),
            None => Err(RotationError::Missing),
        }
    }

    pub async fn auth_failures(&self) -> u64 {
        self.0.lock().await.auth_failures
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LoginError {
    #[error("invalid access key")]
    Invalid,
    #[error("session limit reached")]
    SessionLimit,
}

#[derive(Debug, thiserror::Error)]
pub enum RotationError {
    #[error("no prepared candidate")]
    Missing,
    #[error("candidate does not match")]
    Mismatch,
    #[error("candidate expired")]
    Expired,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationPrepared {
    pub candidate_id: String,
    #[serde(serialize_with = "serialize_secret")]
    pub access_key: Zeroizing<String>,
    pub expires_at: u64,
}

fn serialize_secret<S>(value: &Zeroizing<String>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rotation_is_two_phase_and_revokes_existing_sessions() {
        let state = SecurityState::new(digest_secret("old-key"));
        let session = state.login("old-key").await.unwrap();
        let prepared = state.prepare_rotation().await;

        assert!(state.validate_session(&session).await);
        assert!(state.login("old-key").await.is_ok());
        state.commit_rotation(&prepared.candidate_id).await.unwrap();
        assert!(!state.validate_session(&session).await);
        assert!(state.login("old-key").await.is_err());
        assert!(state.login(&prepared.access_key).await.is_ok());
        state.commit_rotation(&prepared.candidate_id).await.unwrap();
    }

    #[tokio::test]
    async fn cancelled_candidate_does_not_change_active_key() {
        let state = SecurityState::new(digest_secret("old-key"));
        let prepared = state.prepare_rotation().await;
        state.cancel_rotation(&prepared.candidate_id).await.unwrap();
        assert!(state.commit_rotation(&prepared.candidate_id).await.is_err());
        assert!(state.login("old-key").await.is_ok());
    }
}
