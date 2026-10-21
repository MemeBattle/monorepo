//! External identities — who an account is at another provider, and the flows
//! that establish it.
//!
//! An external identity is a row in `external_identities`: the provider's
//! slug, the provider's own identifier for the person, the account it belongs
//! to, and a snapshot of what the provider said about them. One identity
//! belongs to exactly one account; CAS does not merge accounts.
//!
//! A provider dance spans two requests — the browser leaves for the provider
//! and comes back to the callback — and CAS runs as several replicas, so what
//! the callback needs is a row in `external_identity_flows` and never process
//! memory: the `state` parameter *is* that row's id, and consuming it is a
//! single delete-on-read. The same posture as a WebAuthn ceremony
//! (`crate::webauthn::ceremonies`, ADR 0002), with the divergences
//! ADR 0023 records.
//!
//! This module is the vocabulary: the provider's slug, the two intents, the
//! row types and the one-time secret that binds a flow to a browser. The
//! trait every provider implements is [`provider`], the SQL is `repository`,
//! the use cases are [`service`] and the endpoints are [`http`].

pub mod http;
pub mod provider;
mod repository;
pub mod service;

use std::time::Duration;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use thiserror::Error;
use time::OffsetDateTime;
use uuid::Uuid;

pub use provider::{ExchangeError, NormalizedIdentity, Provider, Providers};
pub use service::IdentityService;

pub(crate) use repository::count_identities;

/// How long a flow may take: the person has to arrive at the provider, sign
/// in there and be sent back. Ten minutes is generous for a form and short
/// enough that an abandoned flow is worth nothing.
pub const FLOW_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// How much longer than the browser the server keeps a flow row. The cookie's
/// `Max-Age` is [`FLOW_TIMEOUT`], measured from the moment it reaches the
/// browser, which is later than the row's own start; without a margin the
/// server would be the one to give up first. The same reasoning as
/// [`crate::webauthn::CEREMONY_GRACE`].
pub const FLOW_GRACE: Duration = Duration::from_secs(30);

/// Upper bound on a profile field, in characters. The values are a provider's
/// to choose and are only ever shown, so they are capped rather than
/// validated.
pub const MAX_PROFILE_FIELD_LENGTH: usize = 256;

/// Upper bound on a provider's own identifier for a person. Far above any
/// provider's (an OIDC `sub` is at most 255 characters), and it bounds what a
/// provider's answer can write into a row. A longer answer is refused rather
/// than cut: the subject is the key an identity is found by, and two subjects
/// sharing a prefix are two people.
pub const MAX_PROVIDER_SUBJECT_LENGTH: usize = 255;

/// The display name a new account gets when the provider offered nothing CAS
/// can use as a label. Not a placeholder to be filled in later: it is a valid
/// name the person can change on their own screen.
pub const FALLBACK_DISPLAY_NAME: &str = "User";

/// Which half of the dance a flow is for, read from the flow row on the
/// callback rather than from the URL: the redirect URI registered with a
/// provider stays one stable address (ADR 0023 (e)).
///
/// Maps to the Postgres `external_identity_intent` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "external_identity_intent", rename_all = "snake_case")]
pub enum Intent {
    /// Find the account this identity belongs to, or create one, and open a
    /// session.
    SignIn,
    /// Attach the identity to the account the flow was started for. No
    /// session is issued.
    Link,
}

impl Intent {
    /// The stable word for a log line, rather than the `Debug` of a Rust
    /// type, which is free to change when the type does.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SignIn => "sign_in",
            Self::Link => "link",
        }
    }
}

/// Why a string is not a [`ProviderId`].
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ProviderIdError {
    #[error("must not be empty")]
    Empty,

    #[error("must be at most {MAX_PROVIDER_ID_LENGTH} characters")]
    TooLong,

    #[error("must contain only lowercase ASCII letters, digits, '_' and '-'")]
    DisallowedCharacter,
}

/// Upper bound on a provider slug. A hand-chosen name never needs more, and
/// the value travels in a URL path and in log lines.
pub const MAX_PROVIDER_ID_LENGTH: usize = 32;

/// What a provider is called wherever CAS names one: in the registry, in the
/// `provider` column, and in the callback's path. A slug an operator reads
/// (`telegram`, `github`), deliberately narrow: an uppercase letter or a
/// percent-encoded character would only be a way for two providers to look
/// alike.
#[nutype::nutype(
    sanitize(trim),
    validate(with = validate_provider_id, error = ProviderIdError),
    derive(Debug, Clone, PartialEq, Eq, Hash, AsRef, Deref, Display),
)]
pub struct ProviderId(String);

fn validate_provider_id(value: &str) -> Result<(), ProviderIdError> {
    if value.is_empty() {
        return Err(ProviderIdError::Empty);
    }
    if value.chars().count() > MAX_PROVIDER_ID_LENGTH {
        return Err(ProviderIdError::TooLong);
    }
    if !value
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'_' | b'-'))
    {
        return Err(ProviderIdError::DisallowedCharacter);
    }

    Ok(())
}

/// What a provider said about the person when the identity was linked, kept
/// as received and capped at [`MAX_PROFILE_FIELD_LENGTH`] characters.
///
/// Data for a screen, never a credential and never a label CAS holds to its
/// own rules: the account's own display name is derived from it once, when
/// the account is created, and validated then.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProfileSnapshot {
    pub name: Option<String>,
    pub username: Option<String>,
    pub picture: Option<String>,
}

impl ProfileSnapshot {
    /// A snapshot of a provider's answer, every field capped. Blank fields
    /// are dropped: a provider that sends an empty string has said nothing.
    pub fn new(name: Option<String>, username: Option<String>, picture: Option<String>) -> Self {
        Self {
            name: capped(name),
            username: capped(username),
            picture: capped(picture),
        }
    }

    /// The candidates for the display name of an account created from this
    /// snapshot, in the order [`service`] tries them: the name the provider
    /// shows, then the handle it knows the person by. Both may fail CAS's
    /// label rules, which is what the fallback is for.
    pub(crate) fn name_candidates(&self) -> impl Iterator<Item = &str> {
        [self.name.as_deref(), self.username.as_deref()]
            .into_iter()
            .flatten()
    }
}

/// `value` with at most [`MAX_PROFILE_FIELD_LENGTH`] characters, or `None`
/// when there is nothing left. Cut on a character boundary, so a multi-byte
/// character is never split in half.
fn capped(value: Option<String>) -> Option<String> {
    let value = value?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(
        trimmed
            .chars()
            .take(MAX_PROFILE_FIELD_LENGTH)
            .collect::<String>(),
    )
}

/// A row of `external_identities`: one account's identity at one provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalIdentity {
    pub id: Uuid,
    pub account_id: Uuid,
    pub provider: ProviderId,
    /// The provider's own stable identifier for the person.
    pub provider_subject: String,
    pub profile: ProfileSnapshot,
    pub linked_at: OffsetDateTime,
}

/// Why an identity could not be written. The conflict is the interesting
/// one: an identity belongs to exactly one account, so the same
/// `(provider, provider_subject)` cannot arrive twice.
#[derive(Debug, Error)]
pub enum LinkError {
    /// This provider identity is already on an account — this one or another.
    #[error("this identity is already linked to an account")]
    AlreadyLinked,

    /// Classified by `db` before a transport sees it, like every other
    /// context's. The conversion from `sqlx::Error` is the repository's: only
    /// the queries know which constraint means `AlreadyLinked`.
    #[error(transparent)]
    Db(sqlx::Error),
}

/// Bytes of entropy in a flow secret. 256 bits, as a session token has: the
/// same job, for a shorter life.
const SECRET_BYTES: usize = 32;

/// The one-time secret that binds a flow to the browser that started it. It
/// goes out in a cookie and comes back on the callback; the row keeps only
/// its [`hash`](Self::hash), so a read of the flow table hands out no live
/// flows. Never logged; `Debug` is redacted for the same reason.
#[derive(Clone, PartialEq, Eq)]
pub struct FlowSecret(String);

impl FlowSecret {
    /// Draws a fresh secret from the operating system's random source. The
    /// only failure is the OS refusing to provide randomness, which no
    /// request can recover from.
    pub fn generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; SECRET_BYTES];
        getrandom::fill(&mut bytes)?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// Accepts a cookie value only if it has the shape of a secret this
    /// service issued, so a request with junk in the cookie is refused
    /// before it costs a comparison.
    pub fn parse(value: &str) -> Option<Self> {
        let bytes = URL_SAFE_NO_PAD.decode(value).ok()?;
        (bytes.len() == SECRET_BYTES).then(|| Self(value.to_owned()))
    }

    /// What the flow row stores and what the callback compares against.
    pub fn hash(&self) -> Vec<u8> {
        Sha256::digest(self.0.as_bytes()).to_vec()
    }

    /// The value to put in the cookie. Named so that every use of the secret
    /// is visible at the call site.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for FlowSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("FlowSecret(<redacted>)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_provider_id_is_a_narrow_slug() {
        for value in ["telegram", "github", "my-provider", "oidc_2", "a"] {
            assert!(ProviderId::try_new(value).is_ok(), "{value}");
        }
        for value in ["", "   ", "Telegram", "tele gram", "telegram/x", "телеграм"] {
            assert!(ProviderId::try_new(value).is_err(), "{value}");
        }
        assert_eq!(
            ProviderId::try_new("a".repeat(MAX_PROVIDER_ID_LENGTH + 1)),
            Err(ProviderIdError::TooLong)
        );
        assert_eq!(
            ProviderId::try_new(" telegram ").unwrap().as_ref(),
            "telegram"
        );
    }

    #[test]
    fn a_profile_field_is_capped_and_blank_fields_are_dropped() {
        let snapshot = ProfileSnapshot::new(
            Some("ё".repeat(MAX_PROFILE_FIELD_LENGTH + 10)),
            Some("   ".to_owned()),
            None,
        );

        assert_eq!(
            snapshot.name.as_deref().map(|name| name.chars().count()),
            Some(MAX_PROFILE_FIELD_LENGTH),
            "cut on a character boundary"
        );
        assert_eq!(snapshot.username, None);
        assert_eq!(snapshot.picture, None);
    }

    /// The order the service tries them in, with nothing offered skipped.
    #[test]
    fn the_name_candidates_are_the_name_then_the_username() {
        let snapshot = ProfileSnapshot::new(
            Some("Ada Lovelace".to_owned()),
            Some("ada".to_owned()),
            None,
        );
        assert_eq!(
            snapshot.name_candidates().collect::<Vec<_>>(),
            ["Ada Lovelace", "ada"]
        );

        let handle_only = ProfileSnapshot::new(None, Some("ada".to_owned()), None);
        assert_eq!(handle_only.name_candidates().collect::<Vec<_>>(), ["ada"]);

        assert_eq!(
            ProfileSnapshot::default().name_candidates().count(),
            0,
            "nothing offered"
        );
    }

    #[test]
    fn a_generated_secret_parses_back_and_hashes_stably() {
        let secret = FlowSecret::generate().unwrap();

        assert_eq!(FlowSecret::parse(secret.expose()), Some(secret.clone()));
        assert_eq!(secret.expose().len(), 43, "32 bytes of base64url, unpadded");
        assert_eq!(secret.hash(), secret.hash());
        assert_eq!(secret.hash().len(), 32);
        assert_ne!(secret.hash(), secret.expose().as_bytes());
    }

    #[test]
    fn two_secrets_differ() {
        let first = FlowSecret::generate().unwrap();
        let second = FlowSecret::generate().unwrap();

        assert_ne!(first, second);
        assert_ne!(first.hash(), second.hash());
    }

    #[test]
    fn parse_refuses_anything_but_a_secret() {
        for value in ["", "short", &"a".repeat(43), "not base64url!!"] {
            assert!(FlowSecret::parse(value).is_none(), "{value:?}");
        }
    }

    #[test]
    fn debug_never_prints_the_secret() {
        let secret = FlowSecret::generate().unwrap();

        assert!(!format!("{secret:?}").contains(secret.expose()));
    }

    /// The row is kept longer than the browser sends its cookie, so the
    /// server is never the first to give up.
    #[test]
    fn the_server_keeps_a_flow_longer_than_the_browser_sends_its_cookie() {
        assert!(FLOW_GRACE > Duration::ZERO);
        assert!(FLOW_TIMEOUT + FLOW_GRACE > FLOW_TIMEOUT);
    }

    #[test]
    fn the_fallback_display_name_is_a_valid_display_name() {
        assert!(crate::accounts::DisplayName::try_new(FALLBACK_DISPLAY_NAME).is_ok());
    }
}
