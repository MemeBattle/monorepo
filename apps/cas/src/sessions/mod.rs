//! Sessions — what a signed-in browser holds between requests.
//!
//! A session is a row in `sessions` and a random token in an HttpOnly cookie.
//! The row stores the SHA-256 of the token, never the token itself, so a read
//! of the table does not hand out live sessions. Registration and login create
//! a session; `GET /api/me` reads it; `POST /api/logout` deletes it. A session
//! ends when it has been idle for [`SESSION_IDLE_TIMEOUT`] or, whatever
//! happens, its kind's lifetime after it was created; both clocks are the
//! database's. See `docs/adr/0004-cookie-sessions.md`.
//!
//! A session has a [`SessionKind`]. A `full` session is what registration and
//! login issue. An `upgrade` session is what `/oidc/authorize` opens for a guest
//! that presents a fresh ID token as `id_token_hint`: it may only run the
//! account-registration ceremony for its own account, continue
//! `/oidc/authorize`, which never gives it a code, and read `GET /api/me`
//! (ADR 0018). The `Authenticated` extractor admits full sessions only, so
//! every other endpoint answers an upgrade session as unauthenticated; logout
//! ends it like any other. An upgrade
//! session lives for [`UPGRADE_SESSION_LIFETIME`] and only while its account
//! is a guest. See `docs/adr/0015-guest-upgrade.md`.
//!
//! This module is the vocabulary: the token, its hash, the row. Issuing,
//! resolving and revoking sessions is [`service`]; the SQL is `repository`;
//! the cookie, the extractor and the endpoints are [`http`].

pub mod http;
mod repository;
pub mod service;

use std::time::Duration;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::accounts::Account;

pub use service::SessionService;
pub(crate) use service::rotate_upgraded;

/// The absolute cap: how long a session may live from the moment it is
/// created, however active it is. The row's `expires_at` is derived from it
/// and never moves.
pub const SESSION_LIFETIME: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// The absolute cap of an upgrade session. It was opened by an ID token that
/// travelled in a URL, good for ten minutes: one hour is enough to register a
/// passkey and short enough that the hint does not become a month-long
/// session (ADR 0015 (b)).
pub const UPGRADE_SESSION_LIFETIME: Duration = Duration::from_secs(60 * 60);

/// The idle timeout: a session that has not been used for this long is over,
/// even if the absolute cap is far away. The cookie's `Max-Age` is derived
/// from it, so the browser drops the cookie when the server would stop
/// honouring it.
pub const SESSION_IDLE_TIMEOUT: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// How often an authenticated request may reset the idle clock. A request
/// inside this window after the last reset costs no write; one outside it
/// renews the session and re-sends the cookie. The clock therefore lags the
/// last request by up to one window: measured from that request, a session
/// ends between the timeout minus this window and the timeout, which is
/// nothing against seven days, and the price of a session is one write per
/// hour of use, not one per request.
pub const SESSION_RENEWAL_WINDOW: Duration = Duration::from_secs(60 * 60);

/// `std::time::Duration` for arithmetic with `OffsetDateTime`. The constants
/// above are small enough that the conversion cannot fail.
pub(crate) fn as_time(duration: Duration) -> time::Duration {
    time::Duration::try_from(duration).expect("a session duration fits in time::Duration")
}

/// Bytes of entropy in a token. 256 bits: not guessable, and the same size as
/// the hash that indexes it.
const TOKEN_BYTES: usize = 32;

/// The secret a browser holds: the base64url form of [`TOKEN_BYTES`] random
/// bytes. Never logged, never stored; only its [`hash`](Self::hash) reaches
/// the database. `Debug` is redacted for the same reason.
#[derive(Clone, PartialEq, Eq)]
pub struct SessionToken(String);

impl SessionToken {
    /// Draws a fresh token from the operating system's random source. The
    /// only failure is the OS refusing to provide randomness, which no
    /// request can recover from.
    pub fn generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; TOKEN_BYTES];
        getrandom::fill(&mut bytes)?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// Accepts a cookie value only if it has the shape of a token this
    /// service issued, so a request with junk in the cookie is refused before
    /// it costs a query.
    pub fn parse(value: &str) -> Option<Self> {
        let bytes = URL_SAFE_NO_PAD.decode(value).ok()?;
        (bytes.len() == TOKEN_BYTES).then(|| Self(value.to_owned()))
    }

    /// What the database stores and looks up.
    pub fn hash(&self) -> TokenHash {
        TokenHash(Sha256::digest(self.0.as_bytes()).to_vec())
    }

    /// The value to put in the cookie. Named so that every use of the secret
    /// is visible at the call site.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SessionToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SessionToken(<redacted>)")
    }
}

/// SHA-256 of a [`SessionToken`]. Safe to store and to log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenHash(Vec<u8>);

impl AsRef<[u8]> for TokenHash {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// What a session may do. Maps to the Postgres `session_kind` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "session_kind", rename_all = "lowercase")]
pub enum SessionKind {
    /// A signed-in account: registration and login issue these.
    Full,
    /// A guest on its way to a full account: the registration ceremony for
    /// its own account and `/oidc/authorize`, nothing else (ADR 0015 (a)).
    Upgrade,
}

impl SessionKind {
    /// The absolute cap of a session of this kind, from which the row's
    /// `expires_at` is derived.
    pub fn lifetime(self) -> Duration {
        match self {
            Self::Full => SESSION_LIFETIME,
            Self::Upgrade => UPGRADE_SESSION_LIFETIME,
        }
    }

    /// What goes in the log.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Upgrade => "upgrade",
        }
    }
}

/// A row of `sessions`, without the hash: once found, the row's identity is
/// its id, and the secret has no business travelling further.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: Uuid,
    pub account_id: Uuid,
    pub kind: SessionKind,
    pub created_at: OffsetDateTime,
    /// The absolute cap, fixed at creation.
    pub expires_at: OffsetDateTime,
    /// The last time the idle clock was reset: creation, then each renewal.
    pub last_seen_at: OffsetDateTime,
}

impl Session {
    /// When the session stops being honoured if nothing renews it: the idle
    /// timeout from the last reset, or the absolute cap, whichever is first.
    /// What `/api/me` reports and what the cookie's `Max-Age` is cut to.
    pub fn valid_until(&self) -> OffsetDateTime {
        (self.last_seen_at + as_time(SESSION_IDLE_TIMEOUT)).min(self.expires_at)
    }
}

/// What opened a session. The distinction exists for the lifecycle log,
/// where "an account just appeared" and "an account came back" are different
/// stories about the same kind of session (ADR 0004).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionOrigin {
    Registration,
    Login,
    /// An upgrade session `/oidc/authorize` opened for a guest's `id_token_hint`.
    IdTokenHint,
    /// The full session a finished guest upgrade rotated into.
    Upgrade,
}

impl SessionOrigin {
    /// What goes in the log: a stable word to filter on, rather than the
    /// `Debug` of a Rust type, which is free to change when the type does.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Registration => "registration",
            Self::Login => "login",
            Self::IdTokenHint => "id_token_hint",
            Self::Upgrade => "upgrade",
        }
    }
}

/// What [`SessionService::authenticate`] did to a session's idle clock, so
/// the transport knows whether the browser needs a fresh cookie.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Renewal {
    /// The last reset was inside the renewal window; nothing was written.
    Kept,
    /// The idle clock was reset; the cookie must be re-sent with a new
    /// `Max-Age`.
    Renewed,
}

/// Who a request is: the live session it presented and the account it
/// belongs to. Produced by [`SessionService::authenticate`] and, in the
/// transport, extracted from the cookie by [`http::extract`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Authenticated {
    pub session: Session,
    pub account: Account,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generated_token_parses_back() {
        let token = SessionToken::generate().unwrap();

        assert_eq!(SessionToken::parse(token.expose()), Some(token.clone()));
        assert_eq!(token.expose().len(), 43, "32 bytes of base64url, unpadded");
    }

    #[test]
    fn two_tokens_differ() {
        let first = SessionToken::generate().unwrap();
        let second = SessionToken::generate().unwrap();

        assert_ne!(first, second);
        assert_ne!(first.hash(), second.hash());
    }

    #[test]
    fn the_hash_is_stable_and_not_the_token() {
        let token = SessionToken::generate().unwrap();

        assert_eq!(token.hash(), token.hash());
        assert_eq!(token.hash().as_ref().len(), 32);
        assert_ne!(token.hash().as_ref(), token.expose().as_bytes());
    }

    #[test]
    fn parse_refuses_anything_but_a_token() {
        for value in [
            "",
            "short",
            &"a".repeat(43),
            "not base64url!!",
            &"a".repeat(86),
        ] {
            assert!(
                SessionToken::parse(value).is_none(),
                "{value:?} must not parse"
            );
        }
    }

    #[test]
    fn a_session_is_valid_until_the_idle_timeout_or_the_cap() {
        let now = OffsetDateTime::now_utc();
        let mut session = Session {
            id: Uuid::new_v4(),
            account_id: Uuid::new_v4(),
            kind: SessionKind::Full,
            created_at: now,
            expires_at: now + as_time(SESSION_LIFETIME),
            last_seen_at: now,
        };

        assert_eq!(session.valid_until(), now + as_time(SESSION_IDLE_TIMEOUT));

        // Renewed one day before the cap: the cap wins.
        session.last_seen_at = session.expires_at - time::Duration::days(1);
        assert_eq!(session.valid_until(), session.expires_at);
    }

    #[test]
    fn the_renewal_window_is_small_against_the_idle_timeout() {
        assert!(SESSION_RENEWAL_WINDOW * 24 < SESSION_IDLE_TIMEOUT);
        assert!(SESSION_IDLE_TIMEOUT < SESSION_LIFETIME);
    }

    /// An upgrade session gives up long before a full one would, idle or
    /// not: the hint that opened it was a bearer credential in a URL.
    #[test]
    fn the_upgrade_lifetime_is_shorter_than_the_idle_timeout_and_the_cap() {
        assert_eq!(SessionKind::Upgrade.lifetime(), UPGRADE_SESSION_LIFETIME);
        assert_eq!(SessionKind::Full.lifetime(), SESSION_LIFETIME);
        assert!(UPGRADE_SESSION_LIFETIME < SESSION_IDLE_TIMEOUT);
        assert!(UPGRADE_SESSION_LIFETIME < SESSION_LIFETIME);

        // The cookie follows: `valid_until` is the cap, not the idle clock.
        let now = OffsetDateTime::now_utc();
        let session = Session {
            id: Uuid::new_v4(),
            account_id: Uuid::new_v4(),
            kind: SessionKind::Upgrade,
            created_at: now,
            expires_at: now + as_time(UPGRADE_SESSION_LIFETIME),
            last_seen_at: now,
        };
        assert_eq!(session.valid_until(), session.expires_at);
    }

    #[test]
    fn debug_never_prints_the_secret() {
        let token = SessionToken::generate().unwrap();

        let debug = format!("{token:?}");

        assert!(!debug.contains(token.expose()));
    }
}
