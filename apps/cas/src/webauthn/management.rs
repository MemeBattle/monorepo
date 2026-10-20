//! Passkey management: what a signed-in account may do to its own passkeys.
//!
//! List, rename and delete, each scoped to the account the session names: a
//! passkey that belongs to someone else does not exist as far as this service
//! is concerned. Deleting the last **login method** is refused. There is no
//! recovery in v1 (`docs/PLAN.md`), so an account with no way in could never
//! be signed into again; a second way in is the safety net, and the rule
//! keeps it from being kicked away. An external identity is such a way in
//! (ADR 0023 (g)), so the count is passkeys plus identities. See
//! `docs/adr/0006-passkey-management.md`.

use sqlx::Connection;
use thiserror::Error;
use uuid::Uuid;

use crate::accounts;
use crate::db::Db;
use crate::identities;
use crate::webauthn::passkeys::{PasskeyCredential, PasskeyName};
use crate::webauthn::repository::{self, PasskeyRepository};

#[derive(Debug, Error)]
pub enum ManagementError {
    /// No passkey with that id belongs to the account. Someone else's passkey
    /// is reported the same way as no passkey at all: a caller learns nothing
    /// about ids it does not own.
    #[error("passkey not found")]
    NotFound,

    /// This passkey is the account's only way in. With no recovery in v1,
    /// removing it would lock the account out for good. An external identity
    /// counts as a way in, so an account that has one may delete its last
    /// passkey (ADR 0023 (g)).
    #[error(
        "the last login method cannot be removed; add another passkey or link an account first"
    )]
    LastLoginMethod,

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct PasskeyManagement {
    passkeys: PasskeyRepository,
    db: Db,
}

impl PasskeyManagement {
    pub fn new(db: impl Into<Db>) -> Self {
        let db = db.into();
        Self {
            passkeys: PasskeyRepository::new(db.clone()),
            db,
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
        let mut conn = self.db.acquire().await?;
        let renamed = repository::rename_passkey(&mut *conn, passkey_id, account_id, &name)
            .await?
            .ok_or(ManagementError::NotFound)?;

        tracing::debug!(passkey_id = %passkey_id, account_id = %account_id, "passkey renamed");
        Ok(renamed)
    }

    /// Deletes one of the account's passkeys, unless it is its last login
    /// method.
    ///
    /// The transaction takes the account's row lock first, then the account's
    /// passkey rows: two deletes of the two remaining passkeys at once would
    /// both count two and both proceed, and the account row is where every
    /// login-method change serialises — the future unlink of an identity
    /// (#755) takes the same lock, so the two cannot pass each other by
    /// counting different tables (ADR 0023 (g)). The second waits, then
    /// counts what the first left.
    ///
    /// Sessions opened with the deleted passkey are untouched (ADR 0004): a
    /// passkey is a way in, not the session itself.
    pub async fn delete(&self, account_id: Uuid, passkey_id: Uuid) -> Result<(), ManagementError> {
        let mut conn = self.db.acquire().await?;
        let mut tx = conn.begin().await?;

        accounts::lock(&mut *tx, account_id).await?;
        let owned = repository::lock_passkeys(&mut *tx, account_id).await?;
        if !owned.contains(&passkey_id) {
            return Err(ManagementError::NotFound);
        }
        if owned.len() == 1 && identities::count_identities(&mut *tx, account_id).await? == 0 {
            return Err(ManagementError::LastLoginMethod);
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
    use sqlx::PgPool;

    use crate::testing::{link_external_identity, register_soft_passkey, test_passkey};
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
    async fn the_last_login_method_cannot_be_deleted(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let service = PasskeyManagement::new(pool);

        let error = service
            .delete(registered.account.id, registered.credential.id)
            .await
            .unwrap_err();

        assert!(
            matches!(error, ManagementError::LastLoginMethod),
            "{error:?}"
        );
        assert_eq!(service.list(registered.account.id).await.unwrap().len(), 1);
    }

    /// An external identity is a way into the account, so the passkey is no
    /// longer the last one (ADR 0023 (g)). The same account without the
    /// identity is still refused, which the test above shows.
    #[sqlx::test]
    async fn the_only_passkey_goes_when_an_external_identity_remains(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let account_id = registered.account.id;
        link_external_identity(&pool, account_id, "42").await;
        let service = PasskeyManagement::new(pool);

        service
            .delete(account_id, registered.credential.id)
            .await
            .expect("an account with an external identity keeps a way in");

        assert!(service.list(account_id).await.unwrap().is_empty());
    }

    /// Someone else's identity is not a way into this account.
    #[sqlx::test]
    async fn another_accounts_identity_does_not_unlock_the_guard(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let (_, other) = register_soft_passkey(&pool).await;
        link_external_identity(&pool, other.account.id, "42").await;
        let service = PasskeyManagement::new(pool);

        let error = service
            .delete(registered.account.id, registered.credential.id)
            .await
            .unwrap_err();

        assert!(
            matches!(error, ManagementError::LastLoginMethod),
            "{error:?}"
        );
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
                Err(ManagementError::LastLoginMethod) => refused += 1,
                Err(error) => panic!("unexpected: {error}"),
            }
        }

        assert_eq!((deleted, refused), (1, 1));
        assert_eq!(service.list(account_id).await.unwrap().len(), 1);
    }
}
