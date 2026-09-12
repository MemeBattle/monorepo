//! WebAuthn ceremony state: what the server remembers between issuing a
//! challenge and checking the browser's answer.
//!
//! A ceremony spans two requests. CAS runs as several replicas that scale
//! automatically, so the two requests may land on different instances. The
//! state therefore lives in the `webauthn_ceremonies` table and never in
//! process memory: any replica can finish what another started, and a pod
//! restart loses nothing.
//!
//! Persisting the state needs webauthn-rs's `danger-allow-state-serialisation`
//! feature. The danger the library warns about is *client-side* storage: a
//! cookie the client could replay. A server-side table is the case its
//! documentation lists as safe. See `docs/adr/0002-ceremony-state-in-postgres.md`.
//!
//! This module is the vocabulary: which ceremonies exist, what state they
//! carry and what consuming one can yield. Storing and consuming them is
//! [`repository::start_ceremony`](crate::webauthn::repository::start_ceremony)
//! and [`repository::take_ceremony`](crate::webauthn::repository::take_ceremony).

use serde::{Serialize, de::DeserializeOwned};
use uuid::Uuid;
use webauthn_rs::prelude::{DiscoverableAuthentication, PasskeyRegistration};

use crate::accounts::DisplayName;

/// Which ceremony a row belongs to. Finishing looks rows up by kind as well as
/// by id, so a registration id can never finish a login and vice versa.
///
/// Maps to the Postgres `webauthn_ceremony_kind` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "webauthn_ceremony_kind", rename_all = "lowercase")]
pub enum CeremonyKind {
    Registration,
    Authentication,
}

/// State that can be parked in the ceremony table. The kind belongs to the
/// type: a state and the row's `kind` column can never drift apart, and no
/// caller has to remember to pass the matching one.
pub trait Ceremony: Serialize + DeserializeOwned {
    const KIND: CeremonyKind;
}

/// What consuming a ceremony found. A row that was deleted but does not
/// deserialise is not the same as no row at all: the caller must commit that
/// deletion, or the row answers the next attempt exactly as badly.
#[derive(Debug, PartialEq, Eq)]
pub enum Taken<T> {
    Found(T),
    /// A row was there and has been deleted, but its stored state no longer
    /// matches the type — a state shape that changed under a rollout. Expected,
    /// short-lived, and not a server fault: see
    /// `docs/adr/0002-ceremony-state-in-postgres.md`.
    Undecodable,
    /// Unknown id, expired, already used, or of another kind.
    Missing,
}

/// Distinguishes ceremonies issued with required discoverability
/// from the older optional-resident-key policy. Old rows fail decoding and are
/// consumed as NotFound, so a rollout cannot finish an old-policy ceremony.
#[derive(Debug, Serialize, serde::Deserialize)]
pub struct DiscoverableRegistration {
    pub(crate) passkey: PasskeyRegistration,
}

/// A registration in flight: the account that will be created if the browser
/// comes back with a valid credential.
#[derive(Debug, Serialize, serde::Deserialize)]
pub struct PendingRegistration {
    /// Already handed to the authenticator as the WebAuthn user handle, so the
    /// account row must be created with exactly this id.
    pub account_id: Uuid,
    pub display_name: DisplayName,
    pub state: DiscoverableRegistration,
}

impl Ceremony for PendingRegistration {
    const KIND: CeremonyKind = CeremonyKind::Registration;
}

/// A login in flight. It carries no account: the challenge goes out without
/// `allowCredentials`, and only the assertion says which account signed it.
#[derive(Debug, Serialize, serde::Deserialize)]
pub struct PendingLogin {
    pub state: DiscoverableAuthentication,
}

impl Ceremony for PendingLogin {
    const KIND: CeremonyKind = CeremonyKind::Authentication;
}
