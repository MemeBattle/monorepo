//! Passkey registration: the ceremony that creates an account together with
//! its first credential.
//!
//! `start` issues the challenge and stores the ceremony; `finish` verifies the
//! browser's answer and, in one transaction, consumes the ceremony and writes
//! the account and the credential. The transaction is what makes a failed
//! finish retryable: if the writes fail, the rollback puts the ceremony back,
//! and the credential the authenticator has already created is not orphaned.

use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, RegisterPublicKeyCredential, Webauthn, WebauthnError,
};
use webauthn_rs_proto::{ResidentKeyRequirement, UserVerificationPolicy};

use crate::accounts::{Account, DisplayName, NewAccount};
use crate::webauthn::ceremonies::{DiscoverableRegistration, PendingRegistration, Taken};
use crate::webauthn::passkeys::{CreateError, DEFAULT_PASSKEY_NAME, PasskeyCredential};
use crate::webauthn::repository;

#[derive(Debug, Error)]
pub enum StartError {
    #[error("failed to start the WebAuthn registration: {0}")]
    Webauthn(#[source] WebauthnError),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Error)]
pub enum FinishError {
    /// Unknown id, expired, or already used: a challenge answers one request.
    #[error("registration not found: expired, unknown or already finished")]
    NotFound,

    #[error("failed to verify the registration: {0}")]
    Verification(#[source] WebauthnError),

    /// The authenticator answered with a credential id that is already stored.
    /// Correct authenticators mint a fresh id per registration, so this is a
    /// misbehaving device rather than a user mistake; still a client-side
    /// conflict, not a server fault.
    #[error("the authenticator is already registered")]
    CredentialAlreadyRegistered,

    #[error("a discoverable credential is required for sign-in without a username")]
    DiscoverableCredentialRequired,

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl From<CreateError> for FinishError {
    fn from(error: CreateError) -> Self {
        match error {
            CreateError::CredentialAlreadyRegistered => Self::CredentialAlreadyRegistered,
            CreateError::Db(error) => Self::Db(error),
        }
    }
}

/// The challenge to hand to the browser and the id it must bring back.
#[derive(Debug)]
pub struct StartedRegistration {
    /// Identifies the ceremony, not the account: the account id travels inside
    /// the challenge as the WebAuthn user handle and is only revealed by
    /// [`RegistrationService::finish`].
    pub registration_id: Uuid,
    pub ccr: CreationChallengeResponse,
}

/// What a finished registration created.
#[derive(Debug)]
pub struct Registered {
    pub account: Account,
    pub credential: PasskeyCredential,
}

#[derive(Debug, Clone)]
pub struct RegistrationService {
    webauthn: Webauthn,
    pool: PgPool,
}

/// Keep webauthn-rs's passkey verification and synced-authenticator support,
/// but require discoverability in the browser request. Its 0.5.5 high-level
/// resident-key API requires attestation and rejects synced credentials.
/// Discoverability is a client creation requirement, not a signed authenticator
/// flag; changing these public options does not change signature verification.
/// See ADR 0001 for the library limitation and the trust boundary.
pub(crate) fn start_discoverable_registration(
    webauthn: &Webauthn,
    account_id: Uuid,
    display_name: &str,
) -> Result<(CreationChallengeResponse, DiscoverableRegistration), WebauthnError> {
    let (mut ccr, passkey) =
        webauthn.start_passkey_registration(account_id, display_name, display_name, None)?;
    let selection = ccr
        .public_key
        .authenticator_selection
        .get_or_insert_with(Default::default);
    selection.resident_key = Some(ResidentKeyRequirement::Required);
    selection.require_resident_key = true;
    selection.user_verification = UserVerificationPolicy::Required;
    Ok((ccr, DiscoverableRegistration { passkey }))
}

impl RegistrationService {
    pub fn new(webauthn: Webauthn, pool: PgPool) -> Self {
        Self { webauthn, pool }
    }

    /// Issues a challenge for a new account with the given display name.
    ///
    /// The account id is minted here, before the account exists: it goes to
    /// the authenticator as the WebAuthn user handle, gets baked into the
    /// credential and can never change afterwards. The account row itself is
    /// written by [`finish`](Self::finish), so an abandoned registration
    /// leaves nothing behind but an expiring ceremony row.
    pub async fn start(
        &self,
        display_name: DisplayName,
    ) -> Result<StartedRegistration, StartError> {
        let account_id = Uuid::new_v4();

        // v1 has no username (docs/PLAN.md), so the display name serves as both
        // the WebAuthn user name and its display name.
        let (ccr, state) =
            start_discoverable_registration(&self.webauthn, account_id, &display_name)
                .map_err(StartError::Webauthn)?;

        let registration_id = repository::start_ceremony(
            &self.pool,
            &PendingRegistration {
                account_id,
                display_name,
                state,
            },
        )
        .await?;

        Ok(StartedRegistration {
            registration_id,
            ccr,
        })
    }

    /// Verifies the browser's answer and creates the account with its first
    /// passkey.
    ///
    /// Ceremony, account and credential are handled in one transaction. A
    /// failed verification commits the consumed ceremony: the challenge was
    /// answered, wrongly, and must not be answered again. A failed write rolls
    /// everything back, ceremony included, so the client can retry.
    pub async fn finish(
        &self,
        registration_id: Uuid,
        response: &RegisterPublicKeyCredential,
    ) -> Result<Registered, FinishError> {
        let mut tx = self.pool.begin().await?;

        let pending: PendingRegistration =
            match repository::take_ceremony(&mut *tx, registration_id).await? {
                Taken::Found(pending) => pending,
                // The row was found and deleted, only its state was unusable. The
                // commit is what makes the deletion stick: rolling back here would
                // hand the same unusable row to every retry until it expires.
                Taken::Undecodable => {
                    tx.commit().await?;
                    return Err(FinishError::NotFound);
                }
                Taken::Missing => return Err(FinishError::NotFound),
            };

        let passkey = match self
            .webauthn
            .finish_passkey_registration(response, &pending.state.passkey)
        {
            Ok(passkey) => passkey,
            Err(error) => {
                tx.commit().await?;
                return Err(FinishError::Verification(error));
            }
        };

        // credProps is optional and unsigned. Reject an explicit negative
        // report as a usability failure, but never treat a positive one as
        // authentication proof or reject browsers that omit the extension.
        if response
            .extensions
            .cred_props
            .as_ref()
            .and_then(|props| props.rk)
            == Some(false)
        {
            tx.commit().await?;
            return Err(FinishError::DiscoverableCredentialRequired);
        }

        let account = NewAccount::full(pending.display_name).with_id(pending.account_id);
        let (account, credential) = repository::create_passkey_with_account(
            &mut tx,
            account,
            &passkey,
            DEFAULT_PASSKEY_NAME,
        )
        .await?;

        tx.commit().await?;

        Ok(Registered {
            account,
            credential,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::AccountRepository;
    use crate::testing::{ResidentSoftPasskey, test_origin};
    use crate::testing::{display_name, soft_passkey_registration, test_webauthn};
    use crate::webauthn::repository::PasskeyRepository;
    use webauthn_authenticator_rs::{
        WebauthnAuthenticator, error::WebauthnCError, softpasskey::SoftPasskey,
    };
    use webauthn_rs_proto::CredProps;

    #[test]
    fn an_authenticator_without_resident_storage_cannot_register() {
        let (ccr, _) =
            start_discoverable_registration(&test_webauthn(), Uuid::new_v4(), "Ada").unwrap();
        let error = WebauthnAuthenticator::new(SoftPasskey::new(true))
            .do_registration(test_origin(), ccr)
            .unwrap_err();
        assert!(matches!(error, WebauthnCError::NotSupported));
    }

    #[sqlx::test]
    async fn the_stored_passkey_supports_usernameless_sign_in(pool: PgPool) {
        let service = service(pool.clone());
        let mut authenticator = WebauthnAuthenticator::new(ResidentSoftPasskey::new());
        let started = service.start(display_name("Ada")).await.unwrap();
        let response = authenticator
            .do_registration(test_origin(), started.ccr)
            .unwrap();
        let registered = service
            .finish(started.registration_id, &response)
            .await
            .unwrap();

        let webauthn = test_webauthn();
        let (request, state) = webauthn.start_discoverable_authentication().unwrap();
        assert!(request.public_key.allow_credentials.is_empty());
        let assertion = authenticator
            .do_authentication(test_origin(), request)
            .unwrap();
        let (account_id, credential_id) = webauthn
            .identify_discoverable_authentication(&assertion)
            .unwrap();
        assert_eq!(account_id, registered.account.id);
        let stored = PasskeyRepository::new(pool)
            .list_for_account(account_id)
            .await
            .unwrap();
        let credential = stored
            .iter()
            .find(|credential| credential.credential_id == credential_id)
            .unwrap();
        let result = webauthn
            .finish_discoverable_authentication(&assertion, state, &[(&credential.passkey).into()])
            .unwrap();
        assert!(result.user_verified());
        assert_eq!(result.cred_id(), credential.passkey.cred_id());
    }

    #[sqlx::test]
    async fn a_non_discoverable_result_consumes_the_ceremony_without_creating_an_account(
        pool: PgPool,
    ) {
        let service = service(pool.clone());
        let started = service.start(display_name("Ada")).await.unwrap();
        let account_id = Uuid::from_slice(started.ccr.public_key.user.id.as_ref()).unwrap();
        let mut response = soft_passkey_registration(started.ccr);
        response.extensions.cred_props = Some(CredProps { rk: Some(false) });
        let error = service
            .finish(started.registration_id, &response)
            .await
            .unwrap_err();
        assert!(matches!(error, FinishError::DiscoverableCredentialRequired));
        assert_eq!(ceremony_count(&pool).await, 0);
        assert!(
            AccountRepository::new(pool.clone())
                .get(account_id)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            PasskeyRepository::new(pool)
                .list_for_account(account_id)
                .await
                .unwrap()
                .is_empty()
        );
        assert!(matches!(
            service
                .finish(started.registration_id, &response)
                .await
                .unwrap_err(),
            FinishError::NotFound
        ));
    }

    #[sqlx::test]
    async fn browsers_may_omit_the_optional_credential_properties(pool: PgPool) {
        let service = service(pool);
        for properties in [None, Some(CredProps { rk: None })] {
            let started = service.start(display_name("Ada")).await.unwrap();
            let mut response = soft_passkey_registration(started.ccr);
            response.extensions.cred_props = properties;
            service
                .finish(started.registration_id, &response)
                .await
                .unwrap();
        }
    }

    #[sqlx::test]
    async fn a_ceremony_from_the_optional_resident_key_policy_is_discarded(pool: PgPool) {
        let service = service(pool.clone());
        let started = service.start(display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        // Restore the pre-policy-wrapper JSON shape. Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE webauthn_ceremonies SET state = jsonb_set(state, '{state}', state #> '{state,passkey}') WHERE id = $1")
            .bind(started.registration_id).execute(&pool).await.unwrap();
        assert!(matches!(
            service
                .finish(started.registration_id, &response)
                .await
                .unwrap_err(),
            FinishError::NotFound
        ));
        assert_eq!(ceremony_count(&pool).await, 0);
    }

    fn service(pool: PgPool) -> RegistrationService {
        RegistrationService::new(test_webauthn(), pool)
    }

    async fn ceremony_count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM webauthn_ceremonies")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn start_and_finish_create_the_account_and_the_credential(pool: PgPool) {
        let service = service(pool.clone());

        let started = service.start(display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        let registered = service
            .finish(started.registration_id, &response)
            .await
            .unwrap();

        assert_eq!(registered.account.display_name.as_ref(), "Ada");
        assert_ne!(
            registered.account.id, started.registration_id,
            "the ceremony id must not double as the account id"
        );
        assert_eq!(registered.credential.account_id, registered.account.id);

        let stored = AccountRepository::new(pool.clone())
            .get(registered.account.id)
            .await
            .unwrap();
        assert_eq!(stored, Some(registered.account));
        let credentials = PasskeyRepository::new(pool.clone())
            .list_for_account(registered.credential.account_id)
            .await
            .unwrap();
        assert_eq!(credentials.len(), 1);
        assert_eq!(
            ceremony_count(&pool).await,
            0,
            "a finished ceremony is gone"
        );
    }

    /// The challenge answers exactly one request.
    #[sqlx::test]
    async fn finishing_twice_is_not_found(pool: PgPool) {
        let service = service(pool);

        let started = service.start(display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        service
            .finish(started.registration_id, &response)
            .await
            .unwrap();

        let error = service
            .finish(started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
    }

    #[sqlx::test]
    async fn finishing_an_unknown_registration_is_not_found(pool: PgPool) {
        let service = service(pool);
        let started = service.start(display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);

        let error = service.finish(Uuid::new_v4(), &response).await.unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
    }

    /// A wrong answer still consumes the challenge: it must not be answered
    /// again, right or wrong.
    #[sqlx::test]
    async fn a_failed_verification_consumes_the_ceremony(pool: PgPool) {
        let service = service(pool.clone());
        let started = service.start(display_name("Ada")).await.unwrap();
        // An answer to a different challenge: syntactically fine, wrong signature.
        let other = service.start(display_name("Bob")).await.unwrap();
        let response = soft_passkey_registration(other.ccr);

        let error = service
            .finish(started.registration_id, &response)
            .await
            .unwrap_err();
        assert!(matches!(error, FinishError::Verification(_)));

        let again = service
            .finish(started.registration_id, &response)
            .await
            .unwrap_err();
        assert!(matches!(again, FinishError::NotFound));
        assert_eq!(
            ceremony_count(&pool).await,
            1,
            "only Bob's ceremony is left"
        );
    }

    /// A state shape that changed under a rollout: the client is told to start
    /// over, and the row is really gone, so the next attempt is not answered by
    /// the same unusable row.
    #[sqlx::test]
    async fn an_undecodable_ceremony_is_not_found_and_is_discarded(pool: PgPool) {
        let service = service(pool.clone());
        let started = service.start(display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE webauthn_ceremonies SET state = '{\"nope\": 1}'::jsonb WHERE id = $1")
            .bind(started.registration_id)
            .execute(&pool)
            .await
            .unwrap();

        let error = service
            .finish(started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
        assert_eq!(
            ceremony_count(&pool).await,
            0,
            "the deletion must be committed, not rolled back"
        );
    }

    #[sqlx::test]
    async fn a_failed_verification_creates_no_account(pool: PgPool) {
        let service = service(pool.clone());
        let started = service.start(display_name("Ada")).await.unwrap();
        let other = service.start(display_name("Bob")).await.unwrap();
        let response = soft_passkey_registration(other.ccr);

        service
            .finish(started.registration_id, &response)
            .await
            .unwrap_err();

        let accounts: i64 = sqlx::query_scalar("SELECT count(*) FROM accounts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(accounts, 0);
    }
}
