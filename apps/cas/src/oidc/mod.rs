//! OIDC — CAS as an OpenID Provider seen from the outside: the signing key
//! set, the discovery document and the JWKS (ADR 0009), the authorization
//! endpoint with the codes it issues (ADR 0010), the token endpoint that
//! exchanges a code for an access token, an ID token and a refresh token
//! under a grant (ADR 0011) and refreshes them with rotation and reuse
//! detection (ADR 0012), and userinfo and RP-initiated logout, which verify
//! the tokens CAS issued (ADR 0013). Every endpoint of the minimal profile
//! is served, and `/token` also mints guest accounts for a confidential
//! client through the guest grant (ADR 0014). See
//! `docs/adr/0009-signing-key-and-discovery.md`,
//! `docs/adr/0010-authorization-endpoint.md`,
//! `docs/adr/0011-token-endpoint-and-access-tokens.md`,
//! `docs/adr/0012-refresh-token-rotation.md`,
//! `docs/adr/0013-userinfo-and-rp-initiated-logout.md` and
//! `docs/adr/0014-guest-accounts-and-the-guest-grant.md`.

pub mod authorization;
mod codes;
mod discovery;
mod end_session;
mod exchange;
mod grants;
pub mod http;
mod keys;
mod repository;
pub mod service;
mod token_request;
mod tokens;
mod userinfo;

use std::time::Duration;

pub use authorization::{AuthorizeRequest, OAuthError, PageError, Params, RedirectError};
pub use codes::{
    AuthorizationCode, CodeChallenge, CodeChallengeError, CodeHash, CodeVerifier, CodeVerifierError,
};
pub use discovery::Discovery;
pub use end_session::{EndSessionError, EndSessionService, ValidEndSession};
pub use exchange::{IssuedTokens, TokenService};
pub use grants::revoke_account_grants;
pub use keys::{
    Jwks, JwsError, PublicJwk, SIGNING_ALGORITHM, SigningKey, SigningKeyError, SigningKeys,
    VerifyingKeys,
};
pub use service::{AuthorizationService, IssueError, IssuedCode, RedeemError, RedeemedCode};
pub use token_request::TokenError;
pub use tokens::{
    AccessTokenClaims, IdTokenClaims, InvalidToken, RefreshToken, RefreshTokenHash, UserInfoClaims,
};
pub use userinfo::{UserInfoError, UserInfoService};

/// The extension grant (RFC 6749 §4.5) a confidential client with
/// `guest_login_allowed` uses to mint a guest account on `/token`, from its
/// backend and without any UI (ADR 0014). Advertised by discovery.
pub const GUEST_GRANT_TYPE: &str = "urn:memebattle:oauth:grant-type:guest";

/// How long an authorization code may wait for `/token`. RFC 6749 §4.1.2
/// recommends at most ten minutes; a redirect needs a few seconds, and a
/// minute leaves room for a slow client without leaving a code lying around.
pub const AUTHORIZATION_CODE_LIFETIME: Duration = Duration::from_secs(60);

/// How long an access token, and the ID token issued with it, is honoured.
/// An access token is verified by resource servers locally and never
/// revoked (ADR 0011), so this is how long a stolen one is worth anything
/// and how long a revoked grant or an upgraded guest still shows in tokens
/// already out. Ten minutes keeps that window short at the cost of a
/// refresh every ten minutes of play: short-lived bearer tokens are what
/// RFC 6819 §5.1.5.3 and the OWASP OAuth 2.0 cheat sheet advise.
pub const ACCESS_TOKEN_LIFETIME: Duration = Duration::from_secs(10 * 60);

/// How long a grant, and every refresh token under it, lives: measured from
/// the grant's creation and absolute, so rotation never extends it (OWASP
/// ASVS 5.0 10.4.8, ADR 0012 (g)). Thirty days is the session cap (ADR 0004 (c)):
/// signing in again once a month is one passkey touch.
pub const REFRESH_TOKEN_LIFETIME: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// The sliding window of the guest grant's per-client limit: a client may
/// mint `clients.guest_grants_per_minute` guest accounts in any window of
/// this length, measured by the database clock (ADR 0014 (e)). It is also
/// the `Retry-After` of a refusal: by then every account that counted has
/// left the window.
pub const GUEST_GRANT_RATE_WINDOW: Duration = Duration::from_secs(60);

/// The scope every authorization request must include: without it the
/// request is plain OAuth, which CAS does not serve.
pub const OPENID_SCOPE: &str = "openid";
