//! Short-lived server-side state of a WebAuthn ceremony.
//!
//! A ceremony spans two requests: the server issues a challenge, the browser
//! answers it. The challenge state must survive in between, be usable exactly
//! once, and disappear if the user walks away.
//!
//! **LIMITATION — single instance.** Ceremony state lives in this process's
//! memory, so a ceremony started on one instance can only be finished on the
//! same instance. Running more than one CAS replica requires moving this into
//! a shared store (Redis, or a table) first.
//!
//! In memory is a deliberate choice rather than an oversight: webauthn-rs gates
//! serialising ceremony state behind the `danger-allow-state-serialisation`
//! feature, because state that can leave the server — handed to the client, or
//! written where it can be replayed — reopens the replay attacks the challenge
//! exists to prevent.
//!
//! Expired entries are swept when a new ceremony starts rather than by a
//! background task: there is nothing to reap between requests, and one pass
//! over the map per registration is free at this scale.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio::time::Instant;
use uuid::Uuid;
use webauthn_rs::prelude::PasskeyRegistration;

/// How long a started ceremony can be finished. Matches the timeout the
/// library puts into the challenge sent to the browser, so the server and the
/// authenticator give up at the same moment.
pub const CEREMONY_TTL: Duration = webauthn_rs::DEFAULT_AUTHENTICATOR_TIMEOUT;

/// A registration in flight: the account that will be created if the browser
/// comes back with a valid credential.
#[derive(Debug)]
pub struct PendingRegistration {
    /// Already handed to the authenticator as the WebAuthn user handle, so the
    /// account row must be created with exactly this id.
    pub account_id: Uuid,
    pub display_name: String,
    pub state: PasskeyRegistration,
}

struct Entry<T> {
    expires_at: Instant,
    value: T,
}

/// Single-use, expiring map of ceremony states, keyed by ceremony id.
///
/// Cloning shares the same storage: the store is held in the router state and
/// cloned per request.
pub struct CeremonyStore<T> {
    entries: Arc<Mutex<HashMap<Uuid, Entry<T>>>>,
    ttl: Duration,
}

impl<T> CeremonyStore<T> {
    pub fn new() -> Self {
        Self::with_ttl(CEREMONY_TTL)
    }

    /// Store with a custom lifetime. Only tests need anything but
    /// [`CEREMONY_TTL`].
    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            ttl,
        }
    }

    /// Remembers a ceremony until the TTL runs out, dropping the ones that
    /// already did — an abandoned ceremony is never taken back out, so
    /// without this pass the map would only ever grow.
    pub async fn insert(&self, id: Uuid, value: T) {
        let now = Instant::now();
        let mut entries = self.entries.lock().await;
        entries.retain(|_, entry| entry.expires_at > now);
        entries.insert(
            id,
            Entry {
                expires_at: now + self.ttl,
                value,
            },
        );
    }

    /// Takes a ceremony out, consuming it. Returns `None` when it is unknown,
    /// expired, or already used: a challenge answers exactly one request.
    pub async fn take(&self, id: Uuid) -> Option<T> {
        let entry = self.entries.lock().await.remove(&id)?;
        (entry.expires_at > Instant::now()).then_some(entry.value)
    }

    #[cfg(test)]
    async fn len(&self) -> usize {
        self.entries.lock().await.len()
    }
}

/// Hand-written so that cloning the store never demands `T: Clone`: what is
/// cloned is the shared handle, not the ceremony states.
impl<T> Clone for CeremonyStore<T> {
    fn clone(&self) -> Self {
        Self {
            entries: Arc::clone(&self.entries),
            ttl: self.ttl,
        }
    }
}

impl<T> Default for CeremonyStore<T> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // `start_paused` freezes the clock, so tests move time by hand instead of
    // sleeping.

    #[tokio::test(start_paused = true)]
    async fn take_returns_the_value_once() {
        let store = CeremonyStore::new();
        let id = Uuid::new_v4();
        store.insert(id, "state").await;

        assert_eq!(store.take(id).await, Some("state"));
        assert_eq!(store.take(id).await, None);
    }

    #[tokio::test(start_paused = true)]
    async fn take_returns_none_for_an_unknown_id() {
        let store = CeremonyStore::<&str>::new();

        assert_eq!(store.take(Uuid::new_v4()).await, None);
    }

    #[tokio::test(start_paused = true)]
    async fn an_entry_survives_until_the_ttl_runs_out() {
        let store = CeremonyStore::new();
        let id = Uuid::new_v4();
        store.insert(id, "state").await;

        tokio::time::advance(CEREMONY_TTL - Duration::from_secs(1)).await;

        assert_eq!(store.take(id).await, Some("state"));
    }

    #[tokio::test(start_paused = true)]
    async fn an_expired_entry_is_gone() {
        let store = CeremonyStore::new();
        let id = Uuid::new_v4();
        store.insert(id, "state").await;

        tokio::time::advance(CEREMONY_TTL + Duration::from_secs(1)).await;

        assert_eq!(store.take(id).await, None);
    }

    /// Abandoned ceremonies must not accumulate: nobody ever takes them out.
    #[tokio::test(start_paused = true)]
    async fn insert_drops_expired_entries() {
        let store = CeremonyStore::new();
        store.insert(Uuid::new_v4(), "abandoned").await;

        tokio::time::advance(CEREMONY_TTL + Duration::from_secs(1)).await;
        store.insert(Uuid::new_v4(), "fresh").await;

        assert_eq!(store.len().await, 1);
    }
}
