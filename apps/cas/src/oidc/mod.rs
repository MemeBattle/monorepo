//! OIDC — CAS as an OpenID Provider seen from the outside: the signing key
//! set, the discovery document and the JWKS (ADR 0009), and the
//! authorization endpoint with the codes it issues (ADR 0010). `/token` and
//! the rest arrive with their own tickets and build on what is here. See
//! `docs/adr/0009-signing-key-and-discovery.md` and
//! `docs/adr/0010-authorization-endpoint.md`.

pub mod authorization;
mod codes;
mod discovery;
pub mod http;
mod keys;
mod repository;
pub mod service;

use std::time::Duration;

pub use authorization::{AuthorizeRequest, OAuthError, PageError, Params, RedirectError};
pub use codes::{AuthorizationCode, CodeChallenge, CodeChallengeError, CodeHash};
pub use discovery::Discovery;
pub use keys::{Jwks, PublicJwk, SIGNING_ALGORITHM, SigningKey, SigningKeyError, SigningKeys};
pub use service::{AuthorizationService, IssueError, IssuedCode, RedeemError, RedeemedCode};

/// The extension grant a confidential client uses to mint a guest account
/// on `/token` (#746). Advertised by discovery already.
pub const GUEST_GRANT_TYPE: &str = "urn:memebattle:oauth:grant-type:guest";

/// How long an authorization code may wait for `/token`. RFC 6749 §4.1.2
/// recommends at most ten minutes; a redirect needs a few seconds, and a
/// minute leaves room for a slow client without leaving a code lying around.
pub const AUTHORIZATION_CODE_LIFETIME: Duration = Duration::from_secs(60);

/// The scope every authorization request must include: without it the
/// request is plain OAuth, which CAS does not serve.
pub const OPENID_SCOPE: &str = "openid";
