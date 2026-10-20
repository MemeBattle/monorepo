//! A [`Provider`] with no network behind it: what drives the machinery until
//! the first real provider ships (#754).
//!
//! It is as close to the real thing as a test can get without an HTTP client:
//! `authorization_url` builds the address a provider would, carrying the
//! `state` and the PKCE challenge it was given, and `exchange` answers with a
//! configured identity — or with either refusal, on demand. It also records
//! what it was handed, so a test can assert that the verifier which came back
//! out of the flow row is the one whose challenge went out.

use std::sync::Mutex;

use url::Url;
use uuid::Uuid;

use crate::identities::provider::{
    BoxFuture, ExchangeError, NormalizedIdentity, PkceChallenge, PkceVerifier, Provider,
};
use crate::identities::{ProfileSnapshot, ProviderId};

/// What the fake does when a code is exchanged.
#[derive(Debug, Clone)]
enum Answer {
    /// This identity, whatever the code is.
    Identity {
        subject: String,
        profile: ProfileSnapshot,
    },
    /// The provider answered no.
    Rejected,
    /// The provider could not be reached.
    Unavailable,
}

/// What the fake was asked, for the assertions that need it.
#[derive(Debug, Default)]
struct Calls {
    exchanges: usize,
    code: Option<String>,
    verifier: Option<PkceVerifier>,
    redirect_uri: Option<Url>,
}

/// An identity provider that answers from memory.
#[derive(Debug)]
pub struct FakeProvider {
    id: ProviderId,
    answer: Answer,
    calls: Mutex<Calls>,
}

impl FakeProvider {
    /// A provider registered under `slug` that refuses every code. The
    /// builders below say what it should answer instead.
    pub fn new(slug: &str) -> Self {
        Self {
            id: ProviderId::try_new(slug).expect("a valid test provider slug"),
            answer: Answer::Rejected,
            calls: Mutex::new(Calls::default()),
        }
    }

    /// Answers every exchange with this identity.
    #[must_use]
    pub fn answering(mut self, subject: &str, profile: ProfileSnapshot) -> Self {
        self.answer = Answer::Identity {
            subject: subject.to_owned(),
            profile,
        };
        self
    }

    /// Refuses every code, as a provider does for one already used.
    #[must_use]
    pub fn rejecting(mut self) -> Self {
        self.answer = Answer::Rejected;
        self
    }

    /// Cannot be reached, as a provider that is down is.
    #[must_use]
    pub fn unavailable(mut self) -> Self {
        self.answer = Answer::Unavailable;
        self
    }

    /// How many codes were exchanged: `0` proves a failure happened before
    /// the provider was asked anything.
    pub fn exchanges(&self) -> usize {
        self.locked().exchanges
    }

    /// The code the last exchange was given.
    pub fn exchanged_code(&self) -> Option<String> {
        self.locked().code.clone()
    }

    /// The verifier the last exchange was given, which came out of the flow
    /// row.
    pub fn exchanged_verifier(&self) -> Option<PkceVerifier> {
        self.locked().verifier.clone()
    }

    /// The redirect URI CAS announced, from either operation.
    pub fn redirect_uri(&self) -> Option<Url> {
        self.locked().redirect_uri.clone()
    }

    fn locked(&self) -> std::sync::MutexGuard<'_, Calls> {
        self.calls
            .lock()
            .expect("the fake provider's mutex is only held to record a call")
    }
}

impl Provider for FakeProvider {
    fn id(&self) -> ProviderId {
        self.id.clone()
    }

    fn authorization_url(&self, redirect_uri: &Url, state: Uuid, challenge: &PkceChallenge) -> Url {
        self.locked().redirect_uri = Some(redirect_uri.clone());

        let mut url = Url::parse("https://provider.test/authorize").expect("a constant URL");
        url.query_pairs_mut()
            .append_pair("client_id", self.id.as_ref())
            .append_pair("redirect_uri", redirect_uri.as_str())
            .append_pair("response_type", "code")
            .append_pair("state", &state.to_string())
            .append_pair("code_challenge", challenge.as_str())
            .append_pair("code_challenge_method", PkceChallenge::METHOD);
        url
    }

    fn exchange<'a>(
        &'a self,
        code: String,
        redirect_uri: &'a Url,
        verifier: &'a PkceVerifier,
    ) -> BoxFuture<'a, Result<NormalizedIdentity, ExchangeError>> {
        {
            let mut calls = self.locked();
            calls.exchanges += 1;
            calls.code = Some(code);
            calls.verifier = Some(verifier.clone());
            calls.redirect_uri = Some(redirect_uri.clone());
        }
        let answer = self.answer.clone();

        Box::pin(async move {
            match answer {
                Answer::Identity { subject, profile } => {
                    Ok(NormalizedIdentity { subject, profile })
                }
                Answer::Rejected => Err(ExchangeError::Rejected(
                    "the fake provider refuses every code".to_owned(),
                )),
                Answer::Unavailable => Err(ExchangeError::Unavailable(
                    "the fake provider is not reachable".to_owned(),
                )),
            }
        })
    }
}
