//! Passkey credentials — the WebAuthn authenticators bound to an account.
//!
//! The credential is persisted as the serde form of the webauthn-rs `Passkey`
//! (documented as safe to store) in a jsonb column, with the raw credential id
//! lifted out into its own indexed column because login (#666) has nothing but
//! that id to look the account up by. See
//! `docs/adr/0001-passkey-persistence.md`. The queries themselves live in
//! [`repository`](crate::webauthn::repository).

use thiserror::Error;
use time::OffsetDateTime;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

/// Label given to the passkey created during registration. The user has not
/// been asked for one at that point; passkey management (#668) lets them
/// rename it.
pub const DEFAULT_PASSKEY_NAME: &str = "Passkey";

/// A row of `passkey_credentials`.
///
/// Deliberately not `PartialEq`: `Passkey` compares credential ids only, so a
/// derived equality would call two rows with different counters or keys
/// equal. Compare fields, or the serde form, explicitly.
#[derive(Debug, Clone)]
pub struct PasskeyCredential {
    pub id: Uuid,
    pub account_id: Uuid,
    /// Raw credential id as the authenticator reports it. Duplicated out of
    /// `passkey` so login can find the row by it.
    pub credential_id: Vec<u8>,
    /// The credential itself: public key, signature counter, backup state,
    /// transports.
    pub passkey: Passkey,
    /// User-facing label.
    pub name: String,
    pub created_at: OffsetDateTime,
    /// `None` until the credential is first used to sign in.
    pub last_used_at: Option<OffsetDateTime>,
}

#[derive(Debug, Error)]
pub enum CreateError {
    /// The credential id is already stored, on this account or another one.
    /// An authenticator must never be registered twice.
    #[error("the credential is already registered")]
    CredentialAlreadyRegistered,

    #[error(transparent)]
    Db(sqlx::Error),
}
