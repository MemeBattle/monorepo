//! Test support shared by the library's tests and the server binary's tests.
//!
//! Compiled only with the `test-support` feature, which the crate enables for
//! its own tests through a dev-dependency on itself; a normal build never
//! includes the software authenticator. See `docs/TESTS.md`.

use uuid::Uuid;
use webauthn_authenticator_rs::{WebauthnAuthenticator, softpasskey::SoftPasskey};
use webauthn_rs::prelude::{
    CreationChallengeResponse, Passkey, RegisterPublicKeyCredential, Url, Webauthn,
};

use crate::accounts::DisplayName;
use crate::ceremonies::build_webauthn;

pub const TEST_RP_ID: &str = "localhost";
pub const TEST_ORIGIN: &str = "http://localhost:5173";

pub fn test_origin() -> Url {
    TEST_ORIGIN.parse().expect("the test origin is a valid URL")
}

/// The relying party the tests register against, built the way the server
/// builds its own.
pub fn test_webauthn() -> Webauthn {
    build_webauthn(TEST_RP_ID, &test_origin()).expect("the test relying party is valid")
}

pub fn display_name(value: &str) -> DisplayName {
    DisplayName::try_new(value).expect("a valid test display name")
}

/// Answers a registration challenge with a software authenticator, the way a
/// browser with a platform passkey would.
///
/// `falsify_uv = true`: registration requires user verification, which a
/// software authenticator can only claim to have done.
pub fn soft_passkey_registration(ccr: CreationChallengeResponse) -> RegisterPublicKeyCredential {
    WebauthnAuthenticator::new(SoftPasskey::new(true))
        .do_registration(test_origin(), ccr)
        .expect("the software authenticator answers a valid challenge")
}

/// Runs a full registration ceremony to obtain a real `Passkey`: a hand-built
/// one would not prove that the library's own serde shape survives storage.
pub fn test_passkey() -> Passkey {
    let webauthn = test_webauthn();
    let (ccr, state) = webauthn
        .start_passkey_registration(Uuid::new_v4(), "test", "test", None)
        .expect("a registration can be started");
    let response = soft_passkey_registration(ccr);
    webauthn
        .finish_passkey_registration(&response, &state)
        .expect("the software authenticator's answer verifies")
}
