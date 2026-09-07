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

use crate::accounts::{Account, DisplayName, NewAccount};
use crate::ceremonies::{self, PendingRegistration, Taken};
use crate::passkeys::{self, CreateError, DEFAULT_PASSKEY_NAME, PasskeyCredential};

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
        let (ccr, state) = self
            .webauthn
            .start_passkey_registration(account_id, &display_name, &display_name, None)
            .map_err(StartError::Webauthn)?;

        let registration_id = ceremonies::start(
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

        let pending: PendingRegistration = match ceremonies::take(&mut *tx, registration_id).await?
        {
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
            .finish_passkey_registration(response, &pending.state)
        {
            Ok(passkey) => passkey,
            Err(error) => {
                tx.commit().await?;
                return Err(FinishError::Verification(error));
            }
        };

        let account = NewAccount::full(pending.display_name).with_id(pending.account_id);
        let (account, credential) =
            passkeys::create_with_account(&mut tx, account, &passkey, DEFAULT_PASSKEY_NAME).await?;

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
    use crate::passkeys::PasskeyRepository;
    use crate::testing::{display_name, soft_passkey_registration, test_webauthn};

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
