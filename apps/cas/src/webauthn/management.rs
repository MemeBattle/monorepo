//! Passkey management: what a signed-in account may do to its own passkeys.
//!
//! List, rename and delete, each scoped to the account the session names: a
//! passkey that belongs to someone else does not exist as far as this service
//! is concerned. Deleting the last passkey is refused. There is no recovery
//! in v1 (`docs/PLAN.md`), so an account without a passkey could never be
//! signed into again; a second passkey is the safety net, and the rule keeps
//! it from being kicked away. See `docs/adr/0006-passkey-management.md`.

use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use crate::webauthn::passkeys::{PasskeyCredential, PasskeyName};
use crate::webauthn::repository::{self, PasskeyRepository};

#[derive(Debug, Error)]
pub enum ManagementError {
    /// No passkey with that id belongs to the account. Someone else's passkey
    /// is reported the same way as no passkey at all: a caller learns nothing
    /// about ids it does not own.
    #[error("passkey not found")]
    NotFound,

    /// The account has exactly one passkey and it is the one to delete. With
    /// no recovery in v1, removing it would lock the account out for good.
    #[error("the last passkey cannot be removed; add another one first")]
    LastPasskey,

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct PasskeyManagement {
    passkeys: PasskeyRepository,
    pool: PgPool,
}

impl PasskeyManagement {
    pub fn new(pool: PgPool) -> Self {
        Self {
            passkeys: PasskeyRepository::new(pool.clone()),
            pool,
        }
    }

    /// The account's passkeys, oldest first.
    pub async fn list(&self, account_id: Uuid) -> Result<Vec<PasskeyCredential>, sqlx::Error> {
        self.passkeys.list_for_account(account_id).await
    }

    /// Renames one of the account's passkeys and returns it as stored.
    pub async fn rename(
        &self,
        account_id: Uuid,
        passkey_id: Uuid,
        name: PasskeyName,
    ) -> Result<PasskeyCredential, ManagementError> {
        let renamed = repository::rename_passkey(&self.pool, passkey_id, account_id, &name)
            .await?
            .ok_or(ManagementError::NotFound)?;

        tracing::debug!(passkey_id = %passkey_id, account_id = %account_id, "passkey renamed");
        Ok(renamed)
    }

    /// Deletes one of the account's passkeys, unless it is the last one.
    ///
    /// The account's passkey rows are locked first, so two deletes running
    /// at once cannot both count two passkeys and both proceed: the second
    /// waits, then counts what the first left. Sessions opened with the
    /// deleted passkey are untouched (ADR 0004): a passkey is a way in, not
    /// the session itself.
    pub async fn delete(&self, account_id: Uuid, passkey_id: Uuid) -> Result<(), ManagementError> {
        let mut tx = self.pool.begin().await?;

        let owned = repository::lock_passkeys(&mut *tx, account_id).await?;
        if !owned.contains(&passkey_id) {
            return Err(ManagementError::NotFound);
        }
        if owned.len() == 1 {
            return Err(ManagementError::LastPasskey);
        }
        // The row is locked and known to be the account's; a miss here would
        // be a bug in the lock, and treating it as "not found" is the honest
        // answer if it ever happened.
        if !repository::delete_passkey(&mut *tx, passkey_id, account_id).await? {
            return Err(ManagementError::NotFound);
        }
        tx.commit().await?;

        tracing::info!(passkey_id = %passkey_id, account_id = %account_id, "passkey deleted");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{register_soft_passkey, test_passkey};
    use crate::webauthn::passkeys::DEFAULT_PASSKEY_NAME;

    fn name(value: &str) -> PasskeyName {
        PasskeyName::try_new(value).unwrap()
    }

    /// An account with its registration passkey and one more, the way the
    /// dashboard's "add a passkey" will leave it.
    async fn account_with_two_passkeys(pool: &PgPool) -> (Uuid, Uuid, Uuid) {
        let (_, registered) = register_soft_passkey(pool).await;
        let second =
            repository::insert_passkey(pool, registered.account.id, &test_passkey(), "Second")
                .await
                .unwrap();
        (registered.account.id, registered.credential.id, second.id)
    }

    #[sqlx::test]
    async fn list_shows_the_account_passkeys_oldest_first(pool: PgPool) {
        let (account_id, first, second) = account_with_two_passkeys(&pool).await;
        let service = PasskeyManagement::new(pool);

        let listed = service.list(account_id).await.unwrap();

        assert_eq!(
            listed.iter().map(|p| p.id).collect::<Vec<_>>(),
            [first, second]
        );
        assert_eq!(listed[0].name, DEFAULT_PASSKEY_NAME);
        assert_eq!(listed[1].name, "Second");
        assert!(service.list(Uuid::new_v4()).await.unwrap().is_empty());
    }

    #[sqlx::test]
    async fn rename_works_on_own_passkeys_only(pool: PgPool) {
        let (account_id, first, _) = account_with_two_passkeys(&pool).await;
        let (_, other) = register_soft_passkey(&pool).await;
        let service = PasskeyManagement::new(pool);

        let renamed = service
            .rename(account_id, first, name("MacBook"))
            .await
            .unwrap();
        assert_eq!(renamed.id, first);
        assert_eq!(renamed.name, "MacBook");

        let error = service
            .rename(account_id, other.credential.id, name("Mine now"))
            .await
            .unwrap_err();
        assert!(matches!(error, ManagementError::NotFound));
        let error = service
            .rename(account_id, Uuid::new_v4(), name("Ghost"))
            .await
            .unwrap_err();
        assert!(matches!(error, ManagementError::NotFound));
        assert_eq!(
            service.list(other.account.id).await.unwrap()[0].name,
            DEFAULT_PASSKEY_NAME,
            "the other account's passkey kept its name"
        );
    }

    #[sqlx::test]
    async fn delete_removes_a_passkey_that_is_not_the_last(pool: PgPool) {
        let (account_id, first, second) = account_with_two_passkeys(&pool).await;
        let service = PasskeyManagement::new(pool);

        service.delete(account_id, first).await.unwrap();

        let left = service.list(account_id).await.unwrap();
        assert_eq!(left.iter().map(|p| p.id).collect::<Vec<_>>(), [second]);
        let error = service.delete(account_id, first).await.unwrap_err();
        assert!(matches!(error, ManagementError::NotFound), "gone is gone");
    }

    #[sqlx::test]
    async fn the_last_passkey_cannot_be_deleted(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = PasskeyManagement::new(pool);

        let error = service
            .delete(registered.account.id, registered.credential.id)
            .await
            .unwrap_err();

        assert!(matches!(error, ManagementError::LastPasskey));
        assert_eq!(service.list(registered.account.id).await.unwrap().len(), 1);
    }

    #[sqlx::test]
    async fn delete_refuses_someone_elses_passkey(pool: PgPool) {
        let (account_id, _, _) = account_with_two_passkeys(&pool).await;
        let (_, other) = register_soft_passkey(&pool).await;
        let service = PasskeyManagement::new(pool);

        let error = service
            .delete(account_id, other.credential.id)
            .await
            .unwrap_err();

        assert!(matches!(error, ManagementError::NotFound));
        assert_eq!(service.list(other.account.id).await.unwrap().len(), 1);
    }

    /// Two deletes of the two remaining passkeys at once. Both are held at
    /// the row lock taken here, so both start from "two left"; on release,
    /// one deletes and the other finds one left and is refused.
    #[sqlx::test]
    async fn concurrent_deletes_leave_one_passkey(pool: PgPool) {
        let (account_id, first, second) = account_with_two_passkeys(&pool).await;
        let service = PasskeyManagement::new(pool.clone());

        let mut lock = pool.begin().await.unwrap();
        repository::lock_passkeys(&mut *lock, account_id)
            .await
            .unwrap();
        let deletes: Vec<_> = [first, second]
            .into_iter()
            .map(|id| {
                let service = service.clone();
                tokio::spawn(async move { service.delete(account_id, id).await })
            })
            .collect();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        lock.commit().await.unwrap();

        let mut deleted = 0;
        let mut refused = 0;
        for delete in deletes {
            match delete.await.unwrap() {
                Ok(()) => deleted += 1,
                Err(ManagementError::LastPasskey) => refused += 1,
                Err(error) => panic!("unexpected: {error}"),
            }
        }

        assert_eq!((deleted, refused), (1, 1));
        assert_eq!(service.list(account_id).await.unwrap().len(), 1);
    }
}
