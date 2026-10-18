//! WebAuthn — the passkey bounded context: the ceremonies the server remembers
//! between two requests ([`ceremonies`]), the flows that drive them
//! ([`registration`], [`login`], [`addition`], [`upgrade`]), the credentials they store and
//! verify ([`passkeys`]) and what an account may do to its own
//! ([`management`]), the queries behind all of it ([`repository`]) and the
//! endpoints that expose it ([`http`]).

use std::time::Duration;

use webauthn_rs::prelude::{COSEAlgorithm, Url, Webauthn, WebauthnBuilder, WebauthnError};

pub mod addition;
pub mod ceremonies;
pub mod http;
pub mod login;
pub mod management;
pub mod passkeys;
pub mod registration;
pub mod repository;
pub mod upgrade;

#[cfg(test)]
mod stored_data_tests;

/// How long the browser is given to complete a ceremony. [`build_webauthn`]
/// puts it into every challenge, and [`repository::start_ceremony`] derives the row's
/// expiry from it, so the server and the browser count down from one number.
pub const CEREMONY_TIMEOUT: Duration = webauthn_rs::DEFAULT_AUTHENTICATOR_TIMEOUT;

/// How much longer than the browser the server keeps a ceremony. The browser
/// starts counting when the challenge reaches it, the row started earlier, and
/// the answer needs time to travel back. Without a margin the server would give
/// up first, after the authenticator has already created the credential.
pub const CEREMONY_GRACE: Duration = Duration::from_secs(30);

/// The credential algorithms CAS offers (`pubKeyCredParams`) and accepts, in
/// order of preference. CAS owns this part of its wire contract whatever the
/// library's default is: webauthn-rs 0.6's default adds ES384, which 0.5 cannot
/// verify, so leaving it to the library would let an upgrade register
/// credentials that a rollback could not sign in (ADR 0020 (b)).
pub const CREDENTIAL_ALGORITHMS: [COSEAlgorithm; 2] = [COSEAlgorithm::ES256, COSEAlgorithm::RS256];

/// Builds the `Webauthn` instance for a relying party with the ceremony
/// timeout and the credential algorithms applied. The only place either
/// reaches webauthn-rs.
pub fn build_webauthn(rp_id: &str, origin: &Url) -> Result<Webauthn, WebauthnError> {
    WebauthnBuilder::new(rp_id, origin)?
        .timeout(CEREMONY_TIMEOUT)
        .algorithms(CREDENTIAL_ALGORITHMS.to_vec())
        .build()
}
