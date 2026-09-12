//! Passkey login: the ceremony that signs an existing account in with a
//! discoverable credential, without asking who the user is.
//!
//! `start` issues a challenge with no `allowCredentials` and stores the
//! ceremony; the authenticator picks whichever credential it holds for the
//! relying party and answers with the account id it was registered with (the
//! WebAuthn user handle). `finish` consumes the ceremony, looks the credential
//! up by the id in the assertion, checks that it belongs to the account the
//! handle names, verifies the signature against the stored public key and
//! records the use: the signature counter and backup flags the verifier
//! reports, and `last_used_at`.
//!
//! Everything a client can get wrong — a credential CAS never stored, a handle
//! that names another account, a signature that does not verify, a counter
//! that went backwards — is one outcome, [`FinishError::Rejected`], and the
//! transport turns it into one 401. The reason is logged, not told: a caller
//! who is probing gets nothing to distinguish by.

use sqlx::{PgConnection, PgPool};
use thiserror::Error;
use uuid::Uuid;
use webauthn_rs::prelude::{
    PublicKeyCredential, RequestChallengeResponse, Webauthn, WebauthnError,
};

use crate::accounts::{self, Account};
use crate::webauthn::ceremonies::{PendingLogin, Taken};
use crate::webauthn::passkeys::PasskeyCredential;
use crate::webauthn::repository;

#[derive(Debug, Error)]
pub enum StartError {
    #[error("failed to start the WebAuthn authentication: {0}")]
    Webauthn(#[source] WebauthnError),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Why an assertion was not accepted. Every variant ends the ceremony the same
/// way; they exist so the log says what happened.
#[derive(Debug, Error)]
pub enum Rejection {
    /// A discoverable assertion must name the account through its user handle;
    /// one without a handle, or with a handle that is not an account id,
    /// cannot be matched to an account.
    #[error("the assertion carries no usable user handle")]
    NoUserHandle,

    /// CAS has no credential with the id the assertion names.
    #[error("the credential is not registered")]
    UnknownCredential,

    /// The credential exists but is bound to another account than the user
    /// handle claims. The handle is not covered by the signature, so this is
    /// the check that stops a tampered handle from signing someone else in.
    #[error("the credential belongs to another account than the user handle names")]
    AccountMismatch,

    /// The credential row outlived its account. The cascade makes this
    /// unreachable in practice; it is named rather than unwrapped.
    #[error("the account no longer exists")]
    AccountMissing,

    /// webauthn-rs refused the assertion: wrong challenge or origin, a bad
    /// signature, user verification missing, or a signature counter that did
    /// not advance — the library's sign of a cloned authenticator.
    #[error("the assertion could not be verified: {0}")]
    Verification(#[source] WebauthnError),
}

#[derive(Debug, Error)]
pub enum FinishError {
    /// Unknown id, expired, or already used: a challenge answers one request.
    #[error("login not found: expired, unknown or already finished")]
    NotFound,

    /// The assertion was answered and refused. The ceremony is consumed either
    /// way: a challenge is answered once, right or wrong.
    #[error("login rejected: {0}")]
    Rejected(#[source] Rejection),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl From<Rejection> for FinishError {
    fn from(rejection: Rejection) -> Self {
        Self::Rejected(rejection)
    }
}

/// The challenge to hand to the browser and the id it must bring back.
#[derive(Debug)]
pub struct StartedLogin {
    /// Identifies the ceremony. There is no account to identify yet: only the
    /// assertion says who is signing in.
    pub login_id: Uuid,
    /// The library marks the request for conditional mediation; that is a hint
    /// to the client, which is free to run the same challenge through a modal
    /// prompt instead. The options themselves are the same either way.
    pub rcr: RequestChallengeResponse,
}

/// Who a finished login signed in, and with which credential.
#[derive(Debug)]
pub struct LoggedIn {
    pub account: Account,
    /// The credential as stored after the login: counter and flags updated,
    /// `last_used_at` set.
    pub credential: PasskeyCredential,
}

#[derive(Debug, Clone)]
pub struct LoginService {
    webauthn: Webauthn,
    pool: PgPool,
}

impl LoginService {
    pub fn new(webauthn: Webauthn, pool: PgPool) -> Self {
        Self { webauthn, pool }
    }

    /// Issues a challenge any registered credential may answer. Nothing about
    /// the user is known or asked at this point.
    pub async fn start(&self) -> Result<StartedLogin, StartError> {
        let (rcr, state) = self
            .webauthn
            .start_discoverable_authentication()
            .map_err(StartError::Webauthn)?;

        let login_id = repository::start_ceremony(&self.pool, &PendingLogin { state }).await?;

        Ok(StartedLogin { login_id, rcr })
    }

    /// Verifies the browser's assertion and records the credential's use.
    ///
    /// Ceremony, credential and account are handled in one transaction. A
    /// rejected assertion commits the consumed ceremony: the challenge was
    /// answered, wrongly, and must not be answered again. A failed write rolls
    /// everything back, ceremony included, so the client can retry.
    pub async fn finish(
        &self,
        login_id: Uuid,
        response: &PublicKeyCredential,
    ) -> Result<LoggedIn, FinishError> {
        let mut tx = self.pool.begin().await?;

        let pending: PendingLogin = match repository::take_ceremony(&mut *tx, login_id).await? {
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

        match self.verify(&mut tx, pending, response).await {
            Ok(logged_in) => {
                tx.commit().await?;
                Ok(logged_in)
            }
            Err(FinishError::Rejected(rejection)) => {
                tracing::warn!(
                    login_id = %login_id,
                    credential_id = %response.id,
                    reason = %rejection,
                    "rejected a passkey login"
                );
                tx.commit().await?;
                Err(FinishError::Rejected(rejection))
            }
            // Dropping the transaction rolls it back, ceremony included.
            Err(error) => Err(error),
        }
    }

    /// The checks between a consumed ceremony and a recorded login. Runs on
    /// the caller's transaction; the caller decides what a failure commits.
    async fn verify(
        &self,
        tx: &mut PgConnection,
        pending: PendingLogin,
        response: &PublicKeyCredential,
    ) -> Result<LoggedIn, FinishError> {
        let (account_id, credential_id) = self
            .webauthn
            .identify_discoverable_authentication(response)
            .map_err(|_| Rejection::NoUserHandle)?;

        let mut credential = repository::find_passkey_for_update(&mut *tx, credential_id)
            .await?
            .ok_or(Rejection::UnknownCredential)?;
        if credential.account_id != account_id {
            return Err(Rejection::AccountMismatch.into());
        }

        let result = self
            .webauthn
            .finish_discoverable_authentication(
                response,
                pending.state,
                &[(&credential.passkey).into()],
            )
            .map_err(Rejection::Verification)?;

        // Carries the verified counter and backup flags into the stored
        // credential. It reports whether anything changed; the row is written
        // regardless, because `last_used_at` moves on every login.
        credential.passkey.update_credential(&result);

        let account = accounts::get(&mut *tx, account_id)
            .await?
            .ok_or(Rejection::AccountMissing)?;
        let credential =
            repository::record_passkey_use(&mut *tx, credential.id, &credential.passkey).await?;

        Ok(LoggedIn {
            account,
            credential,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{
        ResidentSoftPasskey, display_name, register_soft_passkey, soft_passkey_assertion,
        test_origin, test_webauthn,
    };
    use crate::webauthn::registration::{RegistrationService, start_discoverable_registration};
    use webauthn_authenticator_rs::WebauthnAuthenticator;
    use webauthn_rs_proto::UserVerificationPolicy;

    fn service(pool: PgPool) -> LoginService {
        LoginService::new(test_webauthn(), pool)
    }

    async fn ceremony_count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM webauthn_ceremonies")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// The signature counter as jsonb holds it.
    async fn stored_counter(pool: &PgPool, credential_id: Uuid) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar(
            "SELECT (credential #>> '{cred,counter}')::bigint FROM passkey_credentials WHERE id = $1",
        )
        .bind(credential_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    fn rejection(error: FinishError) -> Rejection {
        match error {
            FinishError::Rejected(rejection) => rejection,
            other => panic!("expected a rejection, got {other:?}"),
        }
    }

    #[sqlx::test]
    async fn the_challenge_names_no_credential_and_requires_verification(pool: PgPool) {
        let started = service(pool).start().await.unwrap();

        assert!(started.rcr.public_key.allow_credentials.is_empty());
        assert_eq!(
            started.rcr.public_key.user_verification,
            UserVerificationPolicy::Required
        );
    }

    #[sqlx::test]
    async fn start_and_finish_sign_the_registered_account_in(pool: PgPool) {
        let (mut authenticator, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());

        let started = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        let logged_in = service.finish(started.login_id, &assertion).await.unwrap();

        assert_eq!(logged_in.account, registered.account);
        assert_eq!(logged_in.credential.id, registered.credential.id);
        assert!(
            logged_in.credential.last_used_at.is_some(),
            "a login stamps the credential"
        );
        assert_eq!(
            ceremony_count(&pool).await,
            0,
            "a finished ceremony is gone"
        );
    }

    #[sqlx::test]
    async fn every_login_advances_the_stored_signature_counter(pool: PgPool) {
        let (mut authenticator, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let mut counters = vec![stored_counter(&pool, registered.credential.id).await];

        for _ in 0..2 {
            let started = service.start().await.unwrap();
            let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
            service.finish(started.login_id, &assertion).await.unwrap();
            counters.push(stored_counter(&pool, registered.credential.id).await);
        }

        assert!(
            counters.windows(2).all(|pair| pair[0] < pair[1]),
            "the counter must move forward on every login: {counters:?}"
        );
    }

    /// A counter that does not advance is the library's sign of a cloned
    /// authenticator: the login is refused and the credential is left as it
    /// was, `last_used_at` included.
    #[sqlx::test]
    async fn a_counter_that_went_backwards_is_rejected(pool: PgPool) {
        let (mut authenticator, registered) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "UPDATE passkey_credentials SET credential = jsonb_set(credential, '{cred,counter}', '1000') WHERE id = $1",
        )
        .bind(registered.credential.id)
        .execute(&pool)
        .await
        .unwrap();

        let started = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        let error = service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();

        assert!(matches!(
            rejection(error),
            Rejection::Verification(WebauthnError::CredentialPossibleCompromise)
        ));
        let stored =
            repository::find_passkey_for_update(&pool, &registered.credential.credential_id)
                .await
                .unwrap()
                .unwrap();
        assert_eq!(stored.last_used_at, None);
        assert_eq!(stored_counter(&pool, registered.credential.id).await, 1000);
    }

    /// A credential CAS never stored: registered against the same relying
    /// party, but not through the service.
    #[sqlx::test]
    async fn an_unregistered_credential_is_rejected(pool: PgPool) {
        let webauthn = test_webauthn();
        let mut authenticator = WebauthnAuthenticator::new(ResidentSoftPasskey::new());
        let (ccr, _) = start_discoverable_registration(&webauthn, Uuid::new_v4(), "Ada").unwrap();
        authenticator.do_registration(test_origin(), ccr).unwrap();
        let service = service(pool);

        let started = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        let error = service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();

        assert!(matches!(rejection(error), Rejection::UnknownCredential));
    }

    /// The user handle is not covered by the signature. A handle that names
    /// another account than the credential's must not sign that account in.
    #[sqlx::test]
    async fn a_user_handle_for_another_account_is_rejected(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let (_, other) = register_soft_passkey(&pool).await;
        let service = service(pool);

        let started = service.start().await.unwrap();
        let mut assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        assertion.response.user_handle = Some(other.account.id.as_bytes().to_vec().into());
        let error = service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();

        assert!(matches!(rejection(error), Rejection::AccountMismatch));
    }

    #[sqlx::test]
    async fn an_assertion_without_a_user_handle_is_rejected(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let service = service(pool);

        let started = service.start().await.unwrap();
        let mut assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        assertion.response.user_handle = None;
        let error = service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();

        assert!(matches!(rejection(error), Rejection::NoUserHandle));
    }

    /// An answer to a different challenge: syntactically fine, wrong signature.
    #[sqlx::test]
    async fn an_answer_to_another_challenge_is_rejected(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let service = service(pool);

        let started = service.start().await.unwrap();
        let other = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, other.rcr);
        let error = service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();

        assert!(matches!(rejection(error), Rejection::Verification(_)));
    }

    /// A wrong answer still consumes the challenge: it must not be answered
    /// again, right or wrong.
    #[sqlx::test]
    async fn a_rejected_login_consumes_the_ceremony(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());

        let started = service.start().await.unwrap();
        let mut assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        let genuine = assertion.clone();
        assertion.response.user_handle = None;
        service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();

        let again = service
            .finish(started.login_id, &genuine)
            .await
            .unwrap_err();
        assert!(matches!(again, FinishError::NotFound));
        assert_eq!(ceremony_count(&pool).await, 0);
    }

    #[sqlx::test]
    async fn finishing_twice_is_not_found(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let service = service(pool);

        let started = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        service.finish(started.login_id, &assertion).await.unwrap();

        let error = service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();
        assert!(matches!(error, FinishError::NotFound));
    }

    #[sqlx::test]
    async fn finishing_an_unknown_login_is_not_found(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let service = service(pool);
        let started = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);

        let error = service
            .finish(Uuid::new_v4(), &assertion)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
    }

    /// The ceremony table holds both kinds; a registration id must not finish
    /// a login, and trying must not consume the registration.
    #[sqlx::test]
    async fn a_registration_ceremony_cannot_finish_a_login(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let registration = RegistrationService::new(test_webauthn(), pool.clone());
        let service = service(pool.clone());
        let pending = registration.start(display_name("Bob")).await.unwrap();
        let started = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);

        let error = service
            .finish(pending.registration_id, &assertion)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
        assert_eq!(
            ceremony_count(&pool).await,
            2,
            "neither ceremony was consumed"
        );
    }

    /// A state shape that changed under a rollout: the client is told to start
    /// over, and the row is really gone.
    #[sqlx::test]
    async fn an_undecodable_ceremony_is_not_found_and_is_discarded(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let service = service(pool.clone());
        let started = service.start().await.unwrap();
        let assertion = soft_passkey_assertion(&mut authenticator, started.rcr);
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE webauthn_ceremonies SET state = '{\"nope\": 1}'::jsonb WHERE id = $1")
            .bind(started.login_id)
            .execute(&pool)
            .await
            .unwrap();

        let error = service
            .finish(started.login_id, &assertion)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::NotFound));
        assert_eq!(
            ceremony_count(&pool).await,
            0,
            "the deletion must be committed, not rolled back"
        );
    }
}
