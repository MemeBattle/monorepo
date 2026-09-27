//! What `/token` hands out: the refresh token, opaque and stored as its
//! hash, and the claims of the two JWTs, the access token (RFC 9068) and the
//! ID token (OpenID Connect Core §2). Pure domain: the claims are built here
//! and signed by [`super::SigningKey::sign`]; how the refresh token crosses
//! the database boundary is the repository's business. See
//! `docs/adr/0011-token-endpoint-and-access-tokens.md`.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serialize;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use uuid::Uuid;

use super::ACCESS_TOKEN_LIFETIME;
use crate::accounts::{Account, AccountType};
use crate::clients::{Client, Scope};

/// The JOSE `typ` of an access token, RFC 9068 §2.1: it is what stops an ID
/// token, signed by the same key, from being accepted as an access token.
pub const ACCESS_TOKEN_TYPE: &str = "at+jwt";

/// The JOSE `typ` of an ID token.
pub const ID_TOKEN_TYPE: &str = "JWT";

/// The scope that releases `name` into the ID token (OpenID Connect Core
/// §5.4).
const PROFILE_SCOPE: &str = "profile";

/// The scope that releases `email` and `email_verified`.
const EMAIL_SCOPE: &str = "email";

/// Bytes of entropy in a refresh token. 256 bits, as a session token.
const REFRESH_TOKEN_BYTES: usize = 32;

/// A refresh token: the base64url form of [`REFRESH_TOKEN_BYTES`] random
/// bytes. Never logged, never stored; only its [`hash`](Self::hash) reaches
/// the database. `Debug` is redacted for the same reason.
#[derive(Clone, PartialEq, Eq)]
pub struct RefreshToken(String);

impl RefreshToken {
    /// Draws a fresh token from the operating system's random source. The
    /// only failure is the OS refusing to provide randomness.
    pub fn generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; REFRESH_TOKEN_BYTES];
        getrandom::fill(&mut bytes)?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// Accepts a presented value only if it has the shape of a token this
    /// service issued, so junk is refused before it costs a query (#744).
    pub fn parse(value: &str) -> Option<Self> {
        let bytes = URL_SAFE_NO_PAD.decode(value).ok()?;
        (bytes.len() == REFRESH_TOKEN_BYTES).then(|| Self(value.to_owned()))
    }

    /// What the database stores and looks up.
    pub fn hash(&self) -> RefreshTokenHash {
        RefreshTokenHash(Sha256::digest(self.0.as_bytes()).to_vec())
    }

    /// The value for the token response. Named so that every use of the
    /// secret is visible at the call site.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for RefreshToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RefreshToken(<redacted>)")
    }
}

/// SHA-256 of a [`RefreshToken`]. Safe to store and to log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefreshTokenHash(Vec<u8>);

impl RefreshTokenHash {
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

/// The authentication methods an account's tokens report (RFC 8176 `amr`).
/// Every session of a full account was opened by a passkey ceremony, so its
/// tokens say `webauthn`; a guest never authenticated at all and says
/// `anon`. RFC 8176 registers neither value: its registry describes the
/// factors (`hwk`, `swk`, `user`, `pin`, `mfa`), and which of them a passkey
/// is — hardware-bound or synced, a PIN or a fingerprint — CAS is not told.
/// A value that names the ceremony is honest about what CAS knows, and PLAN
/// fixes `anon` for a guest.
fn amr(account_type: AccountType) -> &'static [&'static str] {
    match account_type {
        AccountType::Full => &["webauthn"],
        AccountType::Guest => &["anon"],
    }
}

/// Seconds since the Unix epoch, the JWT `NumericDate` (RFC 7519 §2).
fn numeric_date(at: OffsetDateTime) -> i64 {
    at.unix_timestamp()
}

fn expiry(issued_at: OffsetDateTime) -> i64 {
    numeric_date(issued_at) + ACCESS_TOKEN_LIFETIME.as_secs() as i64
}

/// The granted scopes as one space-separated string (RFC 6749 §3.3), the
/// form of the `scope` claim (RFC 9068 §2.2.3) and of the token response.
pub fn scope_string(scopes: &[Scope]) -> String {
    scopes
        .iter()
        .map(|scope| scope.as_str())
        .collect::<Vec<_>>()
        .join(" ")
}

/// The claims of an access token, RFC 9068 §2.2, plus the two CAS adds for
/// its resource servers: `amr` and `account_type`. Resource servers verify
/// them locally against the JWKS; CAS is not asked again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AccessTokenClaims {
    pub iss: String,
    /// The account id: the `sub` of the ID token too (RFC 9068 §2.2).
    pub sub: Uuid,
    /// The resource server the token is for: the client's configured
    /// audience, not its id.
    pub aud: String,
    pub client_id: String,
    pub scope: String,
    pub exp: i64,
    pub iat: i64,
    /// Unique per token (RFC 9068 §2.2), so a resource server can refuse a
    /// replay if it keeps a list.
    pub jti: Uuid,
    pub amr: &'static [&'static str],
    pub account_type: AccountType,
}

impl AccessTokenClaims {
    /// The claims of a token issued now, by `issuer`, to `client`, for
    /// `account`, carrying `scopes`.
    pub fn new(
        issuer: &str,
        client: &Client,
        account: &Account,
        scopes: &[Scope],
        issued_at: OffsetDateTime,
    ) -> Self {
        Self {
            iss: issuer.to_owned(),
            sub: account.id,
            aud: client.audience.to_string(),
            client_id: client.id.to_string(),
            scope: scope_string(scopes),
            exp: expiry(issued_at),
            iat: numeric_date(issued_at),
            jti: Uuid::new_v4(),
            amr: amr(account.r#type),
            account_type: account.r#type,
        }
    }
}

/// The claims of an ID token, OpenID Connect Core §2, with the profile and
/// email claims the granted scopes release (§5.4). `auth_time` is left out:
/// it is required only when `max_age` is requested, which `/authorize`
/// refuses (ADR 0010 (b)), and what CAS would put there — when the session
/// was opened, not when the passkey was last touched — would mislead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IdTokenClaims {
    pub iss: String,
    pub sub: Uuid,
    /// The client itself (Core §2): an ID token is for the client, not for
    /// a resource server.
    pub aud: String,
    pub exp: i64,
    pub iat: i64,
    /// Echoed from the authorization request when it carried one (Core
    /// §3.1.3.6), so the client can tie the token to its own request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    pub amr: &'static [&'static str],
    pub account_type: AccountType,
    /// The display name, with `profile`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The address, with `email`, when the account has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// Always `false` next to an `email`: addresses are unverified in v1
    /// (PLAN, ADR 0007).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_verified: Option<bool>,
}

impl IdTokenClaims {
    pub fn new(
        issuer: &str,
        client: &Client,
        account: &Account,
        scopes: &[Scope],
        nonce: Option<String>,
        issued_at: OffsetDateTime,
    ) -> Self {
        let granted = |name: &str| scopes.iter().any(|scope| scope.as_str() == name);
        let email = account.email.clone().filter(|_| granted(EMAIL_SCOPE));
        Self {
            iss: issuer.to_owned(),
            sub: account.id,
            aud: client.id.to_string(),
            exp: expiry(issued_at),
            iat: numeric_date(issued_at),
            nonce,
            amr: amr(account.r#type),
            account_type: account.r#type,
            name: granted(PROFILE_SCOPE).then(|| account.display_name.to_string()),
            email_verified: email.as_ref().map(|_| false),
            email,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::{Audience, ClientId, ClientKind, ClientName, RedirectUri};
    use crate::testing::display_name;

    fn scopes(values: &[&str]) -> Vec<Scope> {
        values
            .iter()
            .map(|value| Scope::try_new(*value).unwrap())
            .collect()
    }

    fn client() -> Client {
        Client {
            id: ClientId::try_new("ligretto-web").unwrap(),
            name: ClientName::try_new("Ligretto").unwrap(),
            kind: ClientKind::Public,
            secret_hash: None,
            redirect_uris: vec![RedirectUri::try_new("https://app.example/cb").unwrap()],
            post_logout_redirect_uris: vec![],
            first_party: true,
            guest_login_allowed: false,
            scopes: scopes(&["openid", "profile", "email"]),
            audience: Audience::try_new("ligretto").unwrap(),
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    fn account(r#type: AccountType, email: Option<&str>) -> Account {
        Account {
            id: Uuid::new_v4(),
            display_name: display_name("Ada"),
            r#type,
            email: email.map(str::to_owned),
            created_at: OffsetDateTime::UNIX_EPOCH,
            last_seen_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    fn at(unix: i64) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(unix).unwrap()
    }

    #[test]
    fn a_generated_refresh_token_is_43_base64url_characters_and_parses_back() {
        let token = RefreshToken::generate().unwrap();

        assert_eq!(token.expose().len(), 43, "32 bytes of base64url, unpadded");
        assert_eq!(RefreshToken::parse(token.expose()), Some(token.clone()));
        assert_ne!(token, RefreshToken::generate().unwrap());
    }

    #[test]
    fn parse_refuses_anything_but_a_refresh_token() {
        let token = RefreshToken::generate().unwrap();
        let padded = format!("{}=", token.expose());
        for value in [
            "",
            "short",
            &"a".repeat(43),
            &"a".repeat(44),
            &padded,
            "not base64url!!",
        ] {
            assert!(RefreshToken::parse(value).is_none(), "{value:?}");
        }
    }

    /// Known answer, computed outside the code under test
    /// (`printf %s AAAA... | shasum -a 256`).
    #[test]
    fn the_hash_is_sha256_of_the_token() {
        let token = RefreshToken::parse("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").unwrap();

        let hex: String = token
            .hash()
            .as_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();

        assert_eq!(
            hex,
            "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a"
        );
    }

    #[test]
    fn debug_never_prints_the_refresh_token() {
        let token = RefreshToken::generate().unwrap();

        assert_eq!(format!("{token:?}"), "RefreshToken(<redacted>)");
    }

    #[test]
    fn the_access_token_claims_are_the_rfc_9068_set() {
        let account = account(AccountType::Full, Some("ada@example.com"));

        let claims = AccessTokenClaims::new(
            "https://cas.example",
            &client(),
            &account,
            &scopes(&["openid", "profile"]),
            at(1_000_000),
        );

        let json = serde_json::to_value(&claims).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "iss": "https://cas.example",
                "sub": account.id.to_string(),
                "aud": "ligretto",
                "client_id": "ligretto-web",
                "scope": "openid profile",
                "exp": 1_000_600,
                "iat": 1_000_000,
                "jti": claims.jti.to_string(),
                "amr": ["webauthn"],
                "account_type": "full",
            })
        );
        assert_eq!(claims.jti.get_version_num(), 4);
    }

    #[test]
    fn every_access_token_has_its_own_jti() {
        let account = account(AccountType::Full, None);
        let issue =
            || AccessTokenClaims::new("i", &client(), &account, &scopes(&["openid"]), at(0)).jti;

        assert_ne!(issue(), issue());
    }

    #[test]
    fn a_guest_is_anonymous() {
        let account = account(AccountType::Guest, None);

        let access = AccessTokenClaims::new("i", &client(), &account, &[], at(0));
        let id = IdTokenClaims::new("i", &client(), &account, &[], None, at(0));

        assert_eq!(access.amr, ["anon"]);
        assert_eq!(access.account_type, AccountType::Guest);
        assert_eq!(id.amr, ["anon"]);
        assert_eq!(serde_json::to_value(&id).unwrap()["account_type"], "guest");
    }

    #[test]
    fn the_id_token_is_for_the_client_and_carries_the_nonce() {
        let account = account(AccountType::Full, None);

        let claims = IdTokenClaims::new(
            "https://cas.example",
            &client(),
            &account,
            &scopes(&["openid"]),
            Some("n-0S6".to_owned()),
            at(1_000_000),
        );

        assert_eq!(
            serde_json::to_value(&claims).unwrap(),
            serde_json::json!({
                "iss": "https://cas.example",
                "sub": account.id.to_string(),
                "aud": "ligretto-web",
                "exp": 1_000_600,
                "iat": 1_000_000,
                "nonce": "n-0S6",
                "amr": ["webauthn"],
                "account_type": "full",
            })
        );
    }

    #[test]
    fn profile_releases_the_name_and_email_the_unverified_address() {
        let with_email = account(AccountType::Full, Some("ada@example.com"));
        let claims = |account: &Account, granted: &[&str]| {
            serde_json::to_value(IdTokenClaims::new(
                "i",
                &client(),
                account,
                &scopes(granted),
                None,
                at(0),
            ))
            .unwrap()
        };

        let both = claims(&with_email, &["openid", "profile", "email"]);
        assert_eq!(both["name"], "Ada");
        assert_eq!(both["email"], "ada@example.com");
        assert_eq!(both["email_verified"], false);

        let neither = claims(&with_email, &["openid"]);
        for absent in ["name", "email", "email_verified", "nonce"] {
            assert!(neither.get(absent).is_none(), "{absent}: {neither}");
        }

        let no_address = claims(&account(AccountType::Full, None), &["openid", "email"]);
        assert!(no_address.get("email").is_none(), "{no_address}");
        assert!(no_address.get("email_verified").is_none(), "{no_address}");
    }
}
