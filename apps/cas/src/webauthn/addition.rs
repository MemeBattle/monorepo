//! Passkey addition: the ceremony that registers another passkey for an
//! account that is already signed in.
//!
//! The challenge is the one account registration issues (ADR 0001 (d), (e)):
//! a discoverable credential and user verification required, the account id
//! as the WebAuthn user handle — the session's account here rather than a
//! fresh one — and, what registration has no use for, the account's existing
//! credential ids in `excludeCredentials`, so a conforming client refuses an
//! authenticator that is already registered before any request reaches CAS.
//! `finish` verifies the answer the way registration does and writes the
//! credential under the account from the session, in the one transaction
//! ADR 0002 (c) describes. No account is created and no session is opened.
//! See `docs/adr/0006-passkey-management.md`, decision (g).

use sqlx::PgPool;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, CredentialID, RegisterPublicKeyCredential, Webauthn,
};

use crate::accounts::Account;
use crate::webauthn::ceremonies::{PendingAddition, Taken};
use crate::webauthn::passkeys::{CreateError, DEFAULT_PASSKEY_NAME, PasskeyCredential};
use crate::webauthn::registration::{
    FinishError, StartError, start_discoverable_registration, verify_discoverable_registration,
};
use crate::webauthn::repository::{self, PasskeyRepository};

/// The challenge to hand to the browser and the id it must bring back.
#[derive(Debug)]
pub struct StartedAddition {
    /// Identifies the ceremony. The account is known already — it is the
    /// session's — and travels inside the challenge as the user handle.
    pub registration_id: Uuid,
    pub ccr: CreationChallengeResponse,
}

#[derive(Debug, Clone)]
pub struct AdditionService {
    webauthn: Webauthn,
    passkeys: PasskeyRepository,
    pool: PgPool,
}

impl AdditionService {
    pub fn new(webauthn: Webauthn, pool: PgPool) -> Self {
        Self {
            webauthn,
            passkeys: PasskeyRepository::new(pool.clone()),
            pool,
        }
    }

    /// Issues a challenge for another passkey of `account`, with every
    /// credential the account already has in `excludeCredentials`.
    ///
    /// The user handle is the account id, as at registration: discoverable
    /// login (ADR 0003 (a)) reads the account from the handle and checks it
    /// against the credential row, so a credential created under any other
    /// handle could never sign this account in.
    pub async fn start(&self, account: &Account) -> Result<StartedAddition, StartError> {
        let exclude = self
            .passkeys
            .list_for_account(account.id)
            .await?
            .into_iter()
            .map(|credential| CredentialID::from(credential.credential_id))
            .collect();

        let (ccr, state) = start_discoverable_registration(
            &self.webauthn,
            account.id,
            &account.display_name,
            Some(exclude),
        )
        .map_err(StartError::Webauthn)?;

        let registration_id = repository::start_ceremony(
            &self.pool,
            &PendingAddition {
                account_id: account.id,
                state,
            },
        )
        .await?;

        Ok(StartedAddition {
            registration_id,
            ccr,
        })
    }

    /// Verifies the browser's answer and stores the passkey under
    /// `account_id`, which is the session's account and must be the one the
    /// ceremony was started for.
    ///
    /// Ceremony and credential are handled in one transaction, as at
    /// registration: a failed verification commits the consumed ceremony, a
    /// failed write rolls everything back so the client can retry. A ceremony
    /// that another account's session started is consumed and reported as not
    /// found — the browser signed out and back in as someone else between the
    /// two requests, and the credential it created names the first account.
    pub async fn finish(
        &self,
        account_id: Uuid,
        registration_id: Uuid,
        response: &RegisterPublicKeyCredential,
    ) -> Result<PasskeyCredential, FinishError> {
        let mut tx = self.pool.begin().await?;

        let pending: PendingAddition =
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

        if pending.account_id != account_id {
            tracing::warn!(
                registration_id = %registration_id,
                account_id = %account_id,
                "a passkey addition was answered by another account's session"
            );
            tx.commit().await?;
            return Err(FinishError::NotFound);
        }

        let passkey =
            match verify_discoverable_registration(&self.webauthn, response, &pending.state) {
                Ok(passkey) => passkey,
                // The challenge was answered, wrongly: the commit makes the
                // consumed ceremony stick.
                Err(error) => {
                    tx.commit().await?;
                    return Err(error);
                }
            };

        let credential =
            repository::insert_passkey(&mut *tx, account_id, &passkey, DEFAULT_PASSKEY_NAME)
                .await
                .map_err(CreateError::from)?;

        tx.commit().await?;

        tracing::info!(passkey_id = %credential.id, account_id = %account_id, "passkey added");
        Ok(credential)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::AccountRepository;
    use crate::testing::{
        ResidentSoftPasskey, display_name, register_soft_passkey, soft_passkey_assertion,
        soft_passkey_registration, test_origin, test_passkey, test_webauthn,
    };
    use crate::webauthn::login::LoginService;
    use crate::webauthn::registration::RegistrationService;
    use webauthn_authenticator_rs::{
        WebauthnAuthenticator,
        error::{CtapError, WebauthnCError},
    };

    fn service(pool: PgPool) -> AdditionService {
        AdditionService::new(test_webauthn(), pool)
    }

    async fn ceremony_count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM webauthn_ceremonies")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn account_count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM accounts")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn start_and_finish_add_a_passkey_to_the_account(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());

        let started = service.start(&registered.account).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        let added = service
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap();

        assert_eq!(added.account_id, registered.account.id);
        assert_eq!(added.name, DEFAULT_PASSKEY_NAME);
        assert_eq!(added.last_used_at, None);
        assert_ne!(added.id, registered.credential.id);
        let listed = PasskeyRepository::new(pool.clone())
            .list_for_account(registered.account.id)
            .await
            .unwrap();
        assert_eq!(
            listed.iter().map(|p| p.id).collect::<Vec<_>>(),
            [registered.credential.id, added.id]
        );
        assert_eq!(account_count(&pool).await, 1, "no account is created");
        assert_eq!(
            ceremony_count(&pool).await,
            0,
            "a finished ceremony is gone"
        );
    }

    /// The user handle baked into the new credential is the account id, so
    /// the discoverable login of ADR 0003 accepts it for that account.
    #[sqlx::test]
    async fn the_added_passkey_signs_the_account_in(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let mut second_device = WebauthnAuthenticator::new(ResidentSoftPasskey::new());
        let started = service.start(&registered.account).await.unwrap();
        let user_id = Uuid::from_slice(started.ccr.public_key.user.id.as_ref()).unwrap();
        assert_eq!(user_id, registered.account.id);
        assert_eq!(
            started.ccr.public_key.user.name,
            registered.account.display_name.as_ref()
        );
        let response = second_device
            .do_registration(test_origin(), started.ccr)
            .unwrap();
        let added = service
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap();

        let login = LoginService::new(test_webauthn(), pool);
        let challenge = login.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut second_device, challenge.rcr);
        let logged_in = login.finish(challenge.login_id, &assertion).await.unwrap();

        assert_eq!(logged_in.account.id, registered.account.id);
        assert_eq!(logged_in.credential.id, added.id);
    }

    /// The account's credentials are excluded, and an authenticator that
    /// holds one of them refuses the challenge the way a real one does
    /// (CTAP2 `CREDENTIAL_EXCLUDED`), so no request ever reaches the finish.
    #[sqlx::test]
    async fn the_challenge_excludes_the_account_credentials(pool: PgPool) {
        let (mut registered_device, registered) = register_soft_passkey(&pool).await;
        let second =
            repository::insert_passkey(&pool, registered.account.id, &test_passkey(), "Second")
                .await
                .unwrap();
        let (_, other) = register_soft_passkey(&pool).await;
        let service = service(pool);

        let started = service.start(&registered.account).await.unwrap();

        let mut excluded: Vec<Vec<u8>> = started
            .ccr
            .public_key
            .exclude_credentials
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|descriptor| descriptor.id.to_vec())
            .collect();
        excluded.sort();
        let mut expected = vec![
            registered.credential.credential_id.clone(),
            second.credential_id.clone(),
        ];
        expected.sort();
        assert_eq!(excluded, expected);
        assert!(
            !excluded.contains(&other.credential.credential_id),
            "only the account's own credentials are excluded"
        );
        let error = registered_device
            .do_registration(test_origin(), started.ccr)
            .unwrap_err();
        assert!(matches!(
            error,
            WebauthnCError::Ctap(CtapError::Ctap2CredentialExcluded)
        ));
    }

    #[sqlx::test]
    async fn the_challenge_requires_a_discoverable_credential_and_user_verification(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;

        let started = service(pool).start(&registered.account).await.unwrap();

        let selection = started.ccr.public_key.authenticator_selection.unwrap();
        assert_eq!(
            selection.resident_key,
            Some(webauthn_rs_proto::ResidentKeyRequirement::Required)
        );
        assert!(selection.require_resident_key);
        assert_eq!(
            selection.user_verification,
            webauthn_rs_proto::UserVerificationPolicy::Required
        );
    }

    /// The browser signed out and in as someone else between the two
    /// requests. The credential names the first account and could never sign
    /// the second one in, so it is not stored; the challenge was answered and
    /// is consumed.
    #[sqlx::test]
    async fn a_ceremony_of_another_account_is_consumed_and_not_found(pool: PgPool) {
        let (_, ada) = register_soft_passkey(&pool).await;
        let (_, bob) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let started = service.start(&ada.account).await.unwrap();
        let response = soft_passkey_registration(started.ccr);

        let error = service
            .finish(bob.account.id, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
        assert_eq!(ceremony_count(&pool).await, 0);
        let passkeys = PasskeyRepository::new(pool);
        assert_eq!(
            passkeys
                .list_for_account(bob.account.id)
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            passkeys
                .list_for_account(ada.account.id)
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(matches!(
            service
                .finish(ada.account.id, started.registration_id, &response)
                .await
                .unwrap_err(),
            FinishError::NotFound
        ));
    }

    /// An account registration id is of another kind: it cannot be finished
    /// here, and the mismatch consumes nothing.
    #[sqlx::test]
    async fn an_account_registration_cannot_be_finished_as_an_addition(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let registration = RegistrationService::new(test_webauthn(), pool.clone());
        let started = registration.start(display_name("Bob")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);

        let error = service(pool.clone())
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
        assert_eq!(
            ceremony_count(&pool).await,
            1,
            "Bob's registration is untouched"
        );
        assert_eq!(account_count(&pool).await, 1);
    }

    /// A wrong answer still consumes the challenge: it must not be answered
    /// again, right or wrong.
    #[sqlx::test]
    async fn a_failed_verification_consumes_the_ceremony_and_stores_nothing(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let started = service.start(&registered.account).await.unwrap();
        // An answer to a different challenge: syntactically fine, wrong signature.
        let other = service.start(&registered.account).await.unwrap();
        let response = soft_passkey_registration(other.ccr);

        let error = service
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap_err();
        assert!(matches!(error, FinishError::Verification(_)));

        let again = service
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap_err();
        assert!(matches!(again, FinishError::NotFound));
        assert_eq!(
            ceremony_count(&pool).await,
            1,
            "only the other ceremony is left"
        );
        assert_eq!(
            PasskeyRepository::new(pool)
                .list_for_account(registered.account.id)
                .await
                .unwrap()
                .len(),
            1
        );
    }

    #[sqlx::test]
    async fn a_non_discoverable_result_consumes_the_ceremony_and_stores_nothing(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let started = service.start(&registered.account).await.unwrap();
        let mut response = soft_passkey_registration(started.ccr);
        response.extensions.cred_props = Some(webauthn_rs_proto::CredProps { rk: Some(false) });

        let error = service
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::DiscoverableCredentialRequired));
        assert_eq!(ceremony_count(&pool).await, 0);
        assert_eq!(
            PasskeyRepository::new(pool)
                .list_for_account(registered.account.id)
                .await
                .unwrap()
                .len(),
            1
        );
    }

    /// A conforming client never gets here (`excludeCredentials`), so the
    /// duplicate is produced by hand: the credential the authenticator minted
    /// is stored before the finish, the way a replayed answer would find it.
    #[sqlx::test]
    async fn a_credential_the_account_already_has_is_refused(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let started = service.start(&registered.account).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        let pending = pending_addition(&pool, started.registration_id).await;
        let passkey = test_webauthn()
            .finish_passkey_registration(&response, &pending.state.passkey)
            .unwrap();
        repository::insert_passkey(&pool, registered.account.id, &passkey, "Same device")
            .await
            .unwrap();

        let error = service
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::CredentialAlreadyRegistered));
        let listed = PasskeyRepository::new(pool)
            .list_for_account(registered.account.id)
            .await
            .unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[1].name, "Same device");
    }

    /// The stored state of a ceremony, as a replica finishing it would read it.
    async fn pending_addition(pool: &PgPool, registration_id: Uuid) -> PendingAddition {
        // Unchecked query: see docs/TESTS.md.
        let state: serde_json::Value =
            sqlx::query_scalar("SELECT state FROM webauthn_ceremonies WHERE id = $1")
                .bind(registration_id)
                .fetch_one(pool)
                .await
                .unwrap();
        serde_json::from_value(state).unwrap()
    }

    #[sqlx::test]
    async fn finishing_an_unknown_addition_is_not_found(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = service(pool);
        let started = service.start(&registered.account).await.unwrap();
        let response = soft_passkey_registration(started.ccr);

        let error = service
            .finish(registered.account.id, Uuid::new_v4(), &response)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
    }

    /// The account row is only read at the start; a display name is what the
    /// authenticator shows, and the stored account is unchanged by the whole
    /// ceremony.
    #[sqlx::test]
    async fn the_account_is_untouched(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let started = service.start(&registered.account).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        service
            .finish(registered.account.id, started.registration_id, &response)
            .await
            .unwrap();

        let stored = AccountRepository::new(pool)
            .get(registered.account.id)
            .await
            .unwrap();

        assert_eq!(stored, Some(registered.account));
    }
}
