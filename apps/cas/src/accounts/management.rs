//! Account management: what a signed-in account may change about itself.
//!
//! In v1 that is the email, set or cleared, stored unverified and never
//! read by anything that signs in (`docs/PLAN.md`). The account is the one
//! the session names; the service takes its id and touches no other row.
//! See `docs/adr/0007-account-email.md`.

use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use crate::accounts::{Email, repository};

#[derive(Debug, Error)]
pub enum UpdateEmailError {
    /// The account the session named is gone. Only a race with the delete
    /// that cascades to the session can produce it: the next request under
    /// that cookie finds no session at all.
    #[error("account not found")]
    AccountNotFound,

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct AccountManagement {
    pool: PgPool,
}

impl AccountManagement {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Sets the account's email, or clears it with `None`. Idempotent: the
    /// same call twice leaves the same row, and clearing an absent email is
    /// no error.
    ///
    /// Logged at `info` with the account id and whether the address was set
    /// or cleared, never the address: it is the future recovery anchor, so a
    /// change to it is worth a line, and the value itself belongs to the
    /// user.
    pub async fn set_email(
        &self,
        account_id: Uuid,
        email: Option<Email>,
    ) -> Result<(), UpdateEmailError> {
        if !repository::set_email(&self.pool, account_id, email.as_ref()).await? {
            return Err(UpdateEmailError::AccountNotFound);
        }

        if email.is_some() {
            tracing::info!(account_id = %account_id, "account email set");
        } else {
            tracing::info!(account_id = %account_id, "account email cleared");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::testing::{capture_tracing, display_name};

    fn email(value: &str) -> Email {
        Email::try_new(value).unwrap()
    }

    async fn account(pool: &PgPool) -> Uuid {
        AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap()
            .id
    }

    #[sqlx::test]
    async fn sets_changes_and_clears_the_email(pool: PgPool) {
        let repository = AccountRepository::new(pool.clone());
        let management = AccountManagement::new(pool.clone());
        let id = account(&pool).await;

        management
            .set_email(id, Some(email("ada@example.com")))
            .await
            .unwrap();
        let stored = repository.get(id).await.unwrap().unwrap();
        assert_eq!(stored.email.as_deref(), Some("ada@example.com"));

        management
            .set_email(id, Some(email("lovelace@example.org")))
            .await
            .unwrap();
        let stored = repository.get(id).await.unwrap().unwrap();
        assert_eq!(stored.email.as_deref(), Some("lovelace@example.org"));

        management.set_email(id, None).await.unwrap();
        let stored = repository.get(id).await.unwrap().unwrap();
        assert_eq!(stored.email, None);
    }

    #[sqlx::test]
    async fn clearing_an_absent_email_is_not_an_error(pool: PgPool) {
        let management = AccountManagement::new(pool.clone());
        let id = account(&pool).await;

        management.set_email(id, None).await.unwrap();
        management.set_email(id, None).await.unwrap();
    }

    #[sqlx::test]
    async fn an_unknown_account_is_reported(pool: PgPool) {
        let management = AccountManagement::new(pool);

        let error = management
            .set_email(Uuid::new_v4(), Some(email("ada@example.com")))
            .await
            .unwrap_err();

        assert!(
            matches!(error, UpdateEmailError::AccountNotFound),
            "{error:?}"
        );
    }

    /// The change is logged, the address is not.
    #[sqlx::test]
    async fn the_change_is_logged_without_the_address(pool: PgPool) {
        let (events, _guard) = capture_tracing();
        let management = AccountManagement::new(pool.clone());
        let id = account(&pool).await;

        management
            .set_email(id, Some(email("ada@example.com")))
            .await
            .unwrap();
        management.set_email(id, None).await.unwrap();

        let set = events.mentioning("account email set");
        assert_eq!(set.len(), 1, "{:?}", events.all());
        assert!(set[0].contains(&id.to_string()), "{}", set[0]);
        assert_eq!(events.mentioning("account email cleared").len(), 1);
        for event in events.all() {
            assert!(
                !event.contains("ada@example.com"),
                "the address must never be logged: {event}"
            );
        }
    }
}
