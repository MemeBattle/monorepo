//! The software authenticator: `ResidentSoftPasskey`, a WebAuthn emulator
//! with resident credentials (see `docs/TESTS.md`).
//!
//! This file is compiled into two targets: the library's unit tests, as
//! `crate::testing::soft_passkey`, and the reference client integration test
//! (`tests/reference_client`), through `#[path]`. Both drive ceremonies with
//! one emulator rather than a second copy that could drift from this one. An
//! integration test links the library built without `cfg(test)`, so it
//! cannot reach `crate::testing`; that is why the file must name no `crate::`
//! path and depend only on the WebAuthn crates.

use webauthn_authenticator_rs::{
    AuthenticatorBackend,
    error::{CtapError, WebauthnCError},
    softpasskey::SoftPasskey,
};
use webauthn_rs::prelude::{
    Base64UrlSafeData, PublicKeyCredential, RegisterPublicKeyCredential, Url,
};
use webauthn_rs_proto::{
    AllowCredentials, CredProps, PublicKeyCredentialCreationOptions,
    PublicKeyCredentialRequestOptions, ResidentKeyRequirement,
};

struct ResidentCredential {
    rp_id: String,
    descriptor: AllowCredentials,
    user_handle: Base64UrlSafeData,
}

/// Adds resident storage and RP-scoped discovery to SoftPasskey's real key
/// generation and signing. Only this test adapter downgrades the options passed
/// to SoftPasskey, which otherwise rejects every resident-key request.
///
/// It also honours `excludeCredentials`, which SoftPasskey ignores: asked to
/// create a credential when it already holds one the relying party excluded,
/// it refuses the way a CTAP2 authenticator does (`CREDENTIAL_EXCLUDED`), so
/// a test can show that a registered authenticator never answers the
/// challenge that adds a passkey.
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
        if let Some(excluded) = &options.exclude_credentials
            && self.credentials.iter().any(|credential| {
                credential.rp_id == rp_id
                    && excluded
                        .iter()
                        .any(|descriptor| descriptor.id == credential.descriptor.id)
            })
        {
            return Err(WebauthnCError::Ctap(CtapError::Ctap2CredentialExcluded));
        }
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
