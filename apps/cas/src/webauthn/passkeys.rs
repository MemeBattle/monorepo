//! Passkey credentials — the WebAuthn authenticators bound to an account.
//!
//! The credential is persisted as the serde form of the webauthn-rs `Passkey`
//! (documented as safe to store) in a jsonb column, with the raw credential id
//! lifted out into its own indexed column because login has nothing but that
//! id to look the account up by. See
//! `docs/adr/0001-passkey-persistence.md`. The queries themselves live in
//! [`repository`](crate::webauthn::repository).

use nutype::nutype;
use thiserror::Error;
use time::OffsetDateTime;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

use crate::shared::label::{LabelError, sanitize_label, validate_label};

/// Label given to the passkey created during registration. The user has not
/// been asked for one at that point; passkey management lets them rename it.
pub const DEFAULT_PASSKEY_NAME: &str = "Passkey";

/// Why a string is not a [`PasskeyName`]: the label rules, under a name of
/// this context's own so the transport can give it its own error code.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error(transparent)]
pub struct PasskeyNameError(LabelError);

fn validate_passkey_name(value: &str) -> Result<(), PasskeyNameError> {
    validate_label(value).map_err(PasskeyNameError)
}

/// The user-facing label of a passkey ("MacBook", "YubiKey"), valid by
/// construction under the shared label rules (`crate::shared::label`):
/// sanitised spaces and NFC, no invisible or direction-changing characters,
/// the same length cap as a display name. Not unique: naming two keys alike
/// is the user's business.
#[nutype(
    sanitize(with = sanitize_label),
    validate(with = validate_passkey_name, error = PasskeyNameError),
    derive(Debug, Clone, PartialEq, Eq, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct PasskeyName(String);

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
    /// transports. Login rewrites it after every successful assertion so the
    /// counter and the backup flags keep up with the authenticator.
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

#[cfg(test)]
mod passkey_name_tests {
    use super::*;

    #[test]
    fn the_default_name_is_a_valid_name() {
        assert_eq!(
            PasskeyName::try_new(DEFAULT_PASSKEY_NAME).map(Into::<String>::into),
            Ok(DEFAULT_PASSKEY_NAME.to_owned())
        );
    }

    #[test]
    fn a_name_is_a_sanitised_valid_label() {
        assert_eq!(
            PasskeyName::try_new("  My\u{a0} YubiKey  ").map(Into::<String>::into),
            Ok("My YubiKey".to_owned())
        );
    }

    #[test]
    fn the_display_name_rejections_apply() {
        assert!(PasskeyName::try_new("").is_err());
        assert!(PasskeyName::try_new("   ").is_err());
        assert!(
            PasskeyName::try_new("a\u{200b}b").is_err(),
            "zero-width space"
        );
        assert!(PasskeyName::try_new("x".repeat(65)).is_err());
    }
}
