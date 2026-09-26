//! OIDC — CAS as an OpenID Provider seen from the outside: the signing key
//! set, the discovery document and the JWKS. `/authorize`, `/token` and the
//! rest arrive with their own tickets and build on what is here. See
//! `docs/adr/0009-signing-key-and-discovery.md`.

mod discovery;
pub mod http;
mod keys;

pub use discovery::Discovery;
pub use keys::{Jwks, PublicJwk, SIGNING_ALGORITHM, SigningKey, SigningKeyError, SigningKeys};

/// The extension grant a confidential client uses to mint a guest account
/// on `/token` (#746). Advertised by discovery already.
pub const GUEST_GRANT_TYPE: &str = "urn:memebattle:oauth:grant-type:guest";
