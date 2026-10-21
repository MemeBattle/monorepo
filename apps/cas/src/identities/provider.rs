//! The provider abstraction: what CAS needs from an external identity
//! provider, and the registry of the ones a deployment has.
//!
//! Two operations are enough for both families CAS will meet (ADR 0023 (b)).
//! An OpenID Connect provider answers the code exchange with an ID token and
//! may have no userinfo endpoint at all (Telegram, #754); a plain OAuth 2
//! provider answers with an access token and is asked a second question
//! (GitHub's `/user`, #759). Either way CAS sends the browser to an
//! authorization URL and later hands back a code, and either way what comes
//! out is one [`NormalizedIdentity`]. Each implementation owns its outbound
//! calls; this module makes no network request and names no HTTP client.
//!
//! The trait is dyn-compatible on purpose — the registry holds
//! `Arc<dyn Provider>` — which is why [`Provider::exchange`] returns a boxed
//! future by hand instead of being an `async fn`. The future is `Send`:
//! axum requires it on both of the crate's targets (ADR 0022).

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use thiserror::Error;
use url::Url;
use uuid::Uuid;

use super::{ProfileSnapshot, ProviderId};

/// A `Send` boxed future, which is what a dyn-compatible async operation
/// returns. Written out rather than taken from a crate: one return type in
/// one trait does not pay for a dependency.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Bytes of entropy in a PKCE verifier. 32 bytes of base64url are 43
/// characters, the shortest verifier RFC 7636 §4.1 allows and the same
/// entropy CAS gives a session token.
const VERIFIER_BYTES: usize = 32;

/// The PKCE verifier: the secret half of the pair, kept in the flow row and
/// presented with the code. Never logged, and `Debug` is redacted — a
/// verifier in a log is a code exchange someone else can finish.
#[derive(Clone, PartialEq, Eq)]
pub struct PkceVerifier(String);

impl PkceVerifier {
    /// Draws a fresh verifier from the operating system's random source.
    pub fn generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; VERIFIER_BYTES];
        getrandom::fill(&mut bytes)?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// The verifier as the flow row stored it. The column is written from
    /// [`expose`](Self::expose) and read back here; nothing else constructs
    /// one from a string.
    pub(crate) fn from_stored(value: String) -> Self {
        Self(value)
    }

    /// The `S256` challenge that travels in the authorization URL: the
    /// base64url of the SHA-256 of the verifier's ASCII (RFC 7636 §4.2).
    pub fn challenge(&self) -> PkceChallenge {
        PkceChallenge(URL_SAFE_NO_PAD.encode(Sha256::digest(self.0.as_bytes())))
    }

    /// The value to send to the provider. Named so that every use of the
    /// secret is visible at the call site.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for PkceVerifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PkceVerifier(<redacted>)")
    }
}

/// The public half of a PKCE pair: what goes out in the authorization URL. A
/// provider that does not implement PKCE simply ignores it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PkceChallenge(String);

impl PkceChallenge {
    /// The `code_challenge` parameter's value.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The `code_challenge_method` that goes with it. `plain` is never
    /// offered.
    pub const METHOD: &'static str = "S256";
}

/// What a provider told CAS about the person, in CAS's own terms.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedIdentity {
    /// The provider's own stable identifier: an OIDC `sub`, or whatever the
    /// provider's API calls its user id. Written as it is answered — it is
    /// what the identity is keyed by, so the service validates it and
    /// refuses what it cannot key by, rather than repairing it.
    pub subject: String,
    pub profile: ProfileSnapshot,
}

/// Why a code exchange did not produce an identity. The two cases differ in
/// whose problem it is, and therefore in what the browser is told: a provider
/// that refused the code answers a `400`, one that did not answer at all a
/// `503`.
#[derive(Debug, Error)]
pub enum ExchangeError {
    /// The provider answered, and the answer was no: a code that was already
    /// used, a signature CAS could not verify, a response it could not read.
    #[error("the provider refused the code: {0}")]
    Rejected(String),

    /// The provider could not be reached, or did not answer in time.
    #[error("the provider is not available: {0}")]
    Unavailable(String),
}

/// One external identity provider. Implementations live with the provider
/// (#754, #759, #760) and own their outbound calls.
pub trait Provider: Send + Sync {
    /// The slug this provider is registered and stored under.
    fn id(&self) -> ProviderId;

    /// Where to send the browser. `state` is the flow row's id, which the
    /// provider echoes back to the callback, and `redirect_uri` is the
    /// callback's absolute address as registered with the provider.
    fn authorization_url(&self, redirect_uri: &Url, state: Uuid, challenge: &PkceChallenge) -> Url;

    /// Turns the code the callback received into an identity. Whatever this
    /// costs — a token request, a signature check, a second API call — is
    /// the implementation's, and it runs with no database connection and no
    /// lock held (ADR 0023 (c)).
    fn exchange<'a>(
        &'a self,
        code: String,
        redirect_uri: &'a Url,
        verifier: &'a PkceVerifier,
    ) -> BoxFuture<'a, Result<NormalizedIdentity, ExchangeError>>;
}

/// The providers a deployment has, by slug. Built once at startup and cloned
/// into the service; empty until the first real provider ships (#754), which
/// is why every flow of this release is a test's.
#[derive(Clone, Default)]
pub struct Providers(HashMap<ProviderId, Arc<dyn Provider>>);

impl Providers {
    /// No providers: what production builds until #754. Every start is
    /// `unknown_provider`.
    pub fn empty() -> Self {
        Self::default()
    }

    /// The registry of `providers`, each under its own
    /// [`id`](Provider::id). Two providers claiming one slug is a
    /// configuration bug, and the later one wins rather than being silently
    /// unreachable under a name the registry does not know.
    pub fn new(providers: impl IntoIterator<Item = Arc<dyn Provider>>) -> Self {
        Self(
            providers
                .into_iter()
                .map(|provider| (provider.id(), provider))
                .collect(),
        )
    }

    /// The provider registered under `id`, or `None` for a slug this
    /// deployment does not serve.
    pub fn get(&self, id: &ProviderId) -> Option<Arc<dyn Provider>> {
        self.0.get(id).cloned()
    }

    /// The registered slugs, sorted: what a log line and a test name.
    pub fn slugs(&self) -> Vec<&str> {
        let mut slugs: Vec<&str> = self.0.keys().map(ProviderId::as_ref).collect();
        slugs.sort_unstable();
        slugs
    }
}

/// `dyn Provider` is not `Debug`, and a registry is worth naming in a
/// service's `Debug`: the slugs are what identifies it.
impl std::fmt::Debug for Providers {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("Providers").field(&self.slugs()).finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeProvider;

    /// The pair as a provider verifies it: SHA-256 of the verifier's ASCII,
    /// base64url without padding, and the method CAS announces.
    #[test]
    fn a_verifier_and_its_challenge_are_an_s256_pair() {
        let verifier = PkceVerifier::generate().unwrap();

        let challenge = verifier.challenge();

        assert_eq!(verifier.expose().len(), 43, "RFC 7636 §4.1's shortest");
        assert_eq!(
            challenge.as_str(),
            URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.expose().as_bytes())),
        );
        assert_eq!(challenge.as_str().len(), 43);
        assert_eq!(PkceChallenge::METHOD, "S256");
        assert_eq!(
            verifier.challenge(),
            challenge,
            "the challenge is a function of the verifier alone"
        );
    }

    #[test]
    fn two_verifiers_differ_and_neither_is_printed() {
        let first = PkceVerifier::generate().unwrap();
        let second = PkceVerifier::generate().unwrap();

        assert_ne!(first, second);
        assert_ne!(first.challenge(), second.challenge());
        assert!(!format!("{first:?}").contains(first.expose()));
    }

    #[test]
    fn the_registry_resolves_a_slug_and_refuses_an_unknown_one() {
        let provider = FakeProvider::new("telegram");
        let providers = Providers::new([Arc::new(provider) as Arc<dyn Provider>]);

        assert_eq!(providers.slugs(), ["telegram"]);
        assert!(
            providers
                .get(&ProviderId::try_new("telegram").unwrap())
                .is_some()
        );
        assert!(
            providers
                .get(&ProviderId::try_new("github").unwrap())
                .is_none()
        );
        assert!(Providers::empty().slugs().is_empty());
    }
}
