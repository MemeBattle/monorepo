//! Test support shared by all of the crate's tests.
//!
//! Compiled only for `cfg(test)`, so a normal build never includes the
//! software authenticator. See `docs/TESTS.md`.

use uuid::Uuid;
use webauthn_authenticator_rs::{
    AuthenticatorBackend, WebauthnAuthenticator, error::WebauthnCError, softpasskey::SoftPasskey,
};
use webauthn_rs::prelude::{
    Base64UrlSafeData, CreationChallengeResponse, Passkey, PublicKeyCredential,
    RegisterPublicKeyCredential, Url, Webauthn,
};
use webauthn_rs_proto::{
    AllowCredentials, CredProps, PublicKeyCredentialCreationOptions,
    PublicKeyCredentialRequestOptions, ResidentKeyRequirement,
};

use crate::accounts::DisplayName;
use crate::webauthn::build_webauthn;
use crate::webauthn::registration::start_discoverable_registration;

struct ResidentCredential {
    rp_id: String,
    descriptor: AllowCredentials,
    user_handle: Base64UrlSafeData,
}

/// Adds resident storage and RP-scoped discovery to SoftPasskey's real key
/// generation and signing. Only this test adapter downgrades the options passed
/// to SoftPasskey, which otherwise rejects every resident-key request.
pub struct ResidentSoftPasskey {
    signer: SoftPasskey,
    credentials: Vec<ResidentCredential>,
}

impl ResidentSoftPasskey {
    pub fn new() -> Self {
        Self {
            signer: SoftPasskey::new(true),
            credentials: Vec::new(),
        }
    }
}

impl AuthenticatorBackend for ResidentSoftPasskey {
    fn perform_register(
        &mut self,
        origin: Url,
        mut options: PublicKeyCredentialCreationOptions,
        timeout_ms: u32,
    ) -> Result<RegisterPublicKeyCredential, WebauthnCError> {
        let selection = options
            .authenticator_selection
            .as_mut()
            .ok_or(WebauthnCError::NotSupported)?;
        if selection.resident_key != Some(ResidentKeyRequirement::Required)
            || !selection.require_resident_key
        {
            return Err(WebauthnCError::NotSupported);
        }
        let rp_id = options.rp.id.clone();
        let user_handle = options.user.id.clone();
        selection.resident_key = Some(ResidentKeyRequirement::Discouraged);
        selection.require_resident_key = false;
        let mut response = self.signer.perform_register(origin, options, timeout_ms)?;
        self.credentials.push(ResidentCredential {
            rp_id,
            descriptor: AllowCredentials {
                type_: "public-key".to_owned(),
                id: response.raw_id.clone(),
                transports: None,
            },
            user_handle,
        });
        response.extensions.cred_props = Some(CredProps { rk: Some(true) });
        Ok(response)
    }

    fn perform_auth(
        &mut self,
        origin: Url,
        mut options: PublicKeyCredentialRequestOptions,
        timeout_ms: u32,
    ) -> Result<PublicKeyCredential, WebauthnCError> {
        let credential = self
            .credentials
            .iter()
            .find(|credential| {
                credential.rp_id == options.rp_id
                    && (options.allow_credentials.is_empty()
                        || options
                            .allow_credentials
                            .iter()
                            .any(|allowed| allowed.id == credential.descriptor.id))
            })
            .ok_or(WebauthnCError::NotSupported)?;
        options.allow_credentials = vec![credential.descriptor.clone()];
        let mut response = self.signer.perform_auth(origin, options, timeout_ms)?;
        response.response.user_handle = Some(credential.user_handle.clone());
        Ok(response)
    }
}

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
    WebauthnAuthenticator::new(ResidentSoftPasskey::new())
        .do_registration(test_origin(), ccr)
        .expect("the software authenticator answers a valid challenge")
}

/// Runs a full registration ceremony to obtain a real `Passkey`: a hand-built
/// one would not prove that the library's own serde shape survives storage.
pub fn test_passkey() -> Passkey {
    let webauthn = test_webauthn();
    let (ccr, state) = start_discoverable_registration(&webauthn, Uuid::new_v4(), "test")
        .expect("a registration can be started");
    let response = soft_passkey_registration(ccr);
    webauthn
        .finish_passkey_registration(&response, &state.passkey)
        .expect("the software authenticator's answer verifies")
}
