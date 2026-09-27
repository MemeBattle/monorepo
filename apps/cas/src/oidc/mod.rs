//! OIDC — CAS as an OpenID Provider seen from the outside: the signing key
//! set, the discovery document and the JWKS (ADR 0009), the authorization
//! endpoint with the codes it issues (ADR 0010), and the token endpoint
//! that exchanges a code for an access token, an ID token and a refresh
//! token under a grant (ADR 0011). Refresh, userinfo, logout and the guest
//! grant arrive with their own tickets and build on what is here. See
//! `docs/adr/0009-signing-key-and-discovery.md`,
//! `docs/adr/0010-authorization-endpoint.md` and
//! `docs/adr/0011-token-endpoint-and-access-tokens.md`.

pub mod authorization;
mod codes;
mod discovery;
mod exchange;
pub mod http;
mod keys;
mod repository;
pub mod service;
mod token_request;
mod tokens;

use std::time::Duration;

pub use authorization::{AuthorizeRequest, OAuthError, PageError, Params, RedirectError};
pub use codes::{
    AuthorizationCode, CodeChallenge, CodeChallengeError, CodeHash, CodeVerifier, CodeVerifierError,
};
pub use discovery::Discovery;
pub use exchange::{IssuedTokens, TokenService};
pub use keys::{Jwks, PublicJwk, SIGNING_ALGORITHM, SigningKey, SigningKeyError, SigningKeys};
pub use service::{AuthorizationService, IssueError, IssuedCode, RedeemError, RedeemedCode};
pub use token_request::TokenError;
pub use tokens::{AccessTokenClaims, IdTokenClaims, RefreshToken, RefreshTokenHash};

/// The extension grant a confidential client uses to mint a guest account
/// on `/token` (#746). Advertised by discovery already.
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
/// the grant's creation and absolute, so rotation (#744) never extends it
/// (OWASP ASVS 5.0 10.4.8). Thirty days is the session cap (ADR 0004 (c)):
/// signing in again once a month is one passkey touch.
pub const REFRESH_TOKEN_LIFETIME: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// The scope every authorization request must include: without it the
/// request is plain OAuth, which CAS does not serve.
pub const OPENID_SCOPE: &str = "openid";
