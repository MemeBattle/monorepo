//! Data access for `accounts`.

use sqlx::PgPool;
use uuid::Uuid;

use super::{Account, AccountType, DisplayName, NewAccount};

/// Inserts an account with any executor — a pool, or the transaction that
/// registration uses to write an account and its first passkey together.
pub(crate) async fn insert<'e, E>(executor: E, account: NewAccount) -> Result<Account, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query_as!(
        Account,
        r#"INSERT INTO accounts (id, display_name, type, email)
           VALUES ($1, $2, $3, $4)
           RETURNING
               id,
               display_name AS "display_name: DisplayName",
               type AS "type: AccountType",
               email,
               created_at,
               last_seen_at"#,
        account.id,
        // `as _`: the macro infers `&str` for a text parameter, so the cast is
        // what makes it use the `Encode` impl for the newtype instead.
        account.display_name as _,
        account.r#type as AccountType,
        account.email,
    )
    .fetch_one(executor)
    .await
}

/// Data access for `accounts`.
#[derive(Debug, Clone)]
pub struct AccountRepository {
    pool: PgPool,
}

impl AccountRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Inserts an account and returns the stored row, including the
    /// database-assigned timestamps.
    pub async fn create(&self, account: NewAccount) -> Result<Account, sqlx::Error> {
        insert(&self.pool, account).await
    }

    /// Looks an account up by id. `Ok(None)` means no such account.
    pub async fn get(&self, id: Uuid) -> Result<Option<Account>, sqlx::Error> {
        sqlx::query_as!(
            Account,
            r#"SELECT
                   id,
                   display_name AS "display_name: DisplayName",
                   type AS "type: AccountType",
                   email,
                   created_at,
                   last_seen_at
               FROM accounts
               WHERE id = $1"#,
            id,
        )
        .fetch_optional(&self.pool)
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::display_name;

    #[sqlx::test]
    async fn creates_a_full_account_with_an_email(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let account = repository
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();

        assert_eq!(account.display_name.as_ref(), "Ada");
        assert_eq!(account.r#type, AccountType::Full);
        assert_eq!(account.email.as_deref(), Some("ada@example.com"));
        // A fresh account has never been seen after its creation.
        assert_eq!(account.last_seen_at, account.created_at);
    }

    #[sqlx::test]
    async fn creates_a_guest_without_an_email(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let account = repository
            .create(NewAccount::guest(display_name("Guest")))
            .await
            .unwrap();

        assert_eq!(account.r#type, AccountType::Guest);
        assert_eq!(account.email, None);
    }

    #[sqlx::test]
    async fn get_returns_the_created_account(pool: PgPool) {
        let repository = AccountRepository::new(pool);
        let created = repository
            .create(NewAccount::full(display_name("Grace")))
            .await
            .unwrap();

        let found = repository.get(created.id).await.unwrap();

        assert_eq!(found, Some(created));
    }

    #[sqlx::test]
    async fn get_returns_none_for_an_unknown_id(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let found = repository.get(Uuid::new_v4()).await.unwrap();

        assert_eq!(found, None);
    }

    #[sqlx::test]
    async fn creates_an_account_with_a_caller_chosen_id(pool: PgPool) {
        let repository = AccountRepository::new(pool);
        let id = Uuid::new_v4();

        let account = repository
            .create(NewAccount::full(display_name("Ada")).with_id(id))
            .await
            .unwrap();

        assert_eq!(account.id, id);
    }

    /// The table has no CHECK, so nothing stops a row written outside CAS from
    /// holding a name with a bidi override in it. The reader is the guarantee:
    /// such a row fails to decode instead of reaching a UI.
    #[sqlx::test]
    async fn get_fails_to_decode_an_invalid_display_name(pool: PgPool) {
        let id = Uuid::new_v4();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("INSERT INTO accounts (id, display_name, type) VALUES ($1, $2, 'full')")
            .bind(id)
            .bind("\u{202e}adA")
            .execute(&pool)
            .await
            .unwrap();

        let error = AccountRepository::new(pool).get(id).await.unwrap_err();

        assert!(
            matches!(error, sqlx::Error::ColumnDecode { .. }),
            "expected a column decode error, got {error:?}"
        );
    }

    /// v1 has no username: two accounts may share a display name.
    #[sqlx::test]
    async fn display_names_are_not_unique(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let first = repository
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let second = repository
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();

        assert_ne!(first.id, second.id);
    }
}
