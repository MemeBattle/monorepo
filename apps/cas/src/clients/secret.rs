//! A confidential client's secret and the form the database keeps.
//!
//! Modelled on the session token (`sessions::SessionToken`, ADR 0004): CAS
//! draws the secret, shows it once, and stores only its SHA-256. A slow
//! password hash would buy nothing here — in a release build `generate` is
//! the only constructor, so the secret is never chosen by a person and there
//! is no low-entropy input to protect — and would cost a KDF on every
//! `/oidc/token` call. A development build may also be handed a chosen value,
//! through `try_dev` below, for a database whose secret has to be known in
//! advance (`docs/adr/0023-dev-only-client-secret.md`); the hashing choice is
//! unchanged by it, since that build's database is a local container. See
//! `docs/adr/0008-oidc-clients-registry.md`.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
#[cfg(debug_assertions)]
use thiserror::Error;

/// Bytes of entropy in a client secret. 256 bits, as for a session token.
const SECRET_BYTES: usize = 32;

/// The secret a confidential client holds: the base64url form of
/// [`SECRET_BYTES`] random bytes, or — in a development build alone — a value
/// `try_dev` was handed. Shown once, at registration, and never stored —
/// only its [`hash`](Self::hash) reaches the database. `Debug` is redacted
/// for the same reason.
#[derive(Clone, PartialEq, Eq)]
pub struct ClientSecret(String);

impl ClientSecret {
    /// Draws a fresh secret from the operating system's random source. The
    /// only failure is the OS refusing to provide randomness.
    pub fn generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; SECRET_BYTES];
        getrandom::fill(&mut bytes)?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// A chosen secret, in development builds alone: `scripts/seed-dev.sh`
    /// passes the stable `ligretto` secret from the monorepo's
    /// `.env.development`, so a fresh database agrees with the checked-in
    /// development configuration without an operator copying a printed value.
    ///
    /// Compiled out of release builds, as the development signing key is
    /// (ADR 0009 (c)), so there [`generate`](Self::generate) is the only
    /// constructor and ADR 0008 (b) — only machine entropy reaches
    /// `secret_hash` — holds by construction. Any non-empty value is
    /// accepted: the one requirement on a dev secret is that it equals what
    /// the application presents. See
    /// `docs/adr/0023-dev-only-client-secret.md`.
    #[cfg(debug_assertions)]
    pub fn try_dev(value: String) -> Result<Self, DevClientSecretError> {
        if value.is_empty() {
            return Err(DevClientSecretError::Empty);
        }
        Ok(Self(value))
    }

    /// What the database stores.
    pub fn hash(&self) -> SecretHash {
        SecretHash(Sha256::digest(self.0.as_bytes()).to_vec())
    }

    /// The value to hand to the operator. Named so that every use of the
    /// secret is visible at the call site.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

/// Why a chosen development secret was refused. One rule: a client that
/// presents nothing must not authenticate.
#[cfg(debug_assertions)]
#[derive(Debug, Error, PartialEq, Eq)]
pub enum DevClientSecretError {
    #[error("a secret must not be empty")]
    Empty,
}

impl std::fmt::Debug for ClientSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ClientSecret(<redacted>)")
    }
}

/// SHA-256 of a [`ClientSecret`]. Safe to store and to log.
///
/// There is no `parse` for a presented secret: a client sends whatever it
/// sends, and the only question worth asking is whether it hashes to this.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecretHash(Vec<u8>);

impl SecretHash {
    /// Rebuilds the hash from what the database stored. Only the repository
    /// needs it; nothing else may invent a hash.
    pub(crate) fn from_bytes(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }

    /// Whether `presented` is the secret this hash was made from. Compared in
    /// constant time: the comparison runs on every `/oidc/token` call, against a
    /// value the caller controls, and a byte-by-byte `==` that returns early
    /// would leak how much of the hash matched. A stored hash of another
    /// length is simply not equal.
    pub fn verify(&self, presented: &str) -> bool {
        let presented = Sha256::digest(presented.as_bytes());
        presented.as_slice().ct_eq(&self.0).into()
    }
}

impl AsRef<[u8]> for SecretHash {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generated_secret_is_32_bytes_of_base64url() {
        let secret = ClientSecret::generate().unwrap();

        assert_eq!(secret.expose().len(), 43, "32 bytes of base64url, unpadded");
        assert_eq!(
            URL_SAFE_NO_PAD.decode(secret.expose()).unwrap().len(),
            SECRET_BYTES
        );
    }

    #[test]
    fn two_secrets_differ() {
        let first = ClientSecret::generate().unwrap();
        let second = ClientSecret::generate().unwrap();

        assert_ne!(first, second);
        assert_ne!(first.hash(), second.hash());
    }

    #[test]
    fn the_hash_verifies_the_secret_and_nothing_else() {
        let secret = ClientSecret::generate().unwrap();
        let hash = secret.hash();

        assert!(hash.verify(secret.expose()));
        assert!(!hash.verify(""));
        assert!(!hash.verify("not the secret"));
        assert!(!hash.verify(ClientSecret::generate().unwrap().expose()));
        // A truncated secret must not pass: the hash is compared whole.
        assert!(!hash.verify(&secret.expose()[..42]));
    }

    /// A stored hash written by something other than CAS may be any length.
    #[test]
    fn a_hash_of_another_length_verifies_nothing() {
        let hash = SecretHash::from_bytes(vec![0u8; 8]);

        assert!(!hash.verify(""));
        assert!(!hash.verify("anything"));
    }

    /// The development constructor exists in this build only, so the test
    /// that covers it does too; the release refusal is tested where the flag
    /// lives (`bin/client.rs`).
    #[cfg(debug_assertions)]
    #[test]
    fn a_dev_secret_is_the_value_it_was_given() {
        let secret = ClientSecret::try_dev("dev-only-ligretto-secret".to_owned()).unwrap();

        assert_eq!(secret.expose(), "dev-only-ligretto-secret");
        assert!(secret.hash().verify("dev-only-ligretto-secret"));
        assert!(!secret.hash().verify("another"));
    }

    #[cfg(debug_assertions)]
    #[test]
    fn an_empty_dev_secret_is_refused() {
        assert_eq!(
            ClientSecret::try_dev(String::new()),
            Err(DevClientSecretError::Empty)
        );
    }

    #[test]
    fn debug_does_not_print_the_secret() {
        let secret = ClientSecret::generate().unwrap();

        let rendered = format!("{secret:?}");

        assert!(!rendered.contains(secret.expose()), "{rendered}");
        assert_eq!(rendered, "ClientSecret(<redacted>)");
    }
}
