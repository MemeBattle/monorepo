//! Accounts — the identity root of CAS.
//!
//! An account id is the OIDC `sub`. Guests are ordinary rows
//! (`type = AccountType::Guest`) so sessions, `/me` and userinfo have a single
//! code path for guests and full accounts; a guest that registers a passkey is
//! upgraded in place, keeping its `sub`. See `docs/PLAN.md`.

use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

/// Whether an account has credentials of its own.
///
/// Maps to the Postgres `account_type` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "account_type", rename_all = "lowercase")]
pub enum AccountType {
    /// Temporary identity created without any user interaction.
    Guest,
    /// Account with at least one credential (a passkey).
    Full,
}

/// A row of `accounts`.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Account {
    /// Stable account id, exposed as the OIDC `sub`.
    pub id: Uuid,
    /// Non-unique: CAS has no username in v1.
    pub display_name: String,
    pub r#type: AccountType,
    /// Optional and unverified in v1; the future recovery anchor.
    pub email: Option<String>,
    pub created_at: OffsetDateTime,
    /// Refreshed on activity; drives guest GC.
    pub last_seen_at: OffsetDateTime,
}

/// The values a caller supplies when creating an account. `id`, `created_at`
/// and `last_seen_at` are assigned by the database.
#[derive(Debug, Clone)]
pub struct NewAccount {
    pub display_name: String,
    pub r#type: AccountType,
    pub email: Option<String>,
}

impl NewAccount {
    /// A guest: no credentials, no email.
    pub fn guest(display_name: impl Into<String>) -> Self {
        Self {
            display_name: display_name.into(),
            r#type: AccountType::Guest,
            email: None,
        }
    }

    /// A full account. Email stays optional — registration only asks for a
    /// display name.
    pub fn full(display_name: impl Into<String>) -> Self {
        Self {
            display_name: display_name.into(),
            r#type: AccountType::Full,
            email: None,
        }
    }

    #[must_use]
    pub fn with_email(mut self, email: impl Into<String>) -> Self {
        self.email = Some(email.into());
        self
    }
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
    /// database-assigned id and timestamps.
    pub async fn create(&self, account: NewAccount) -> Result<Account, sqlx::Error> {
        sqlx::query_as!(
            Account,
            r#"INSERT INTO accounts (display_name, type, email)
               VALUES ($1, $2, $3)
               RETURNING
                   id,
                   display_name,
                   type AS "type: AccountType",
                   email,
                   created_at,
                   last_seen_at"#,
            account.display_name,
            account.r#type as AccountType,
            account.email,
        )
        .fetch_one(&self.pool)
        .await
    }

    /// Looks an account up by id. `Ok(None)` means no such account.
    pub async fn get(&self, id: Uuid) -> Result<Option<Account>, sqlx::Error> {
        sqlx::query_as!(
            Account,
            r#"SELECT
                   id,
                   display_name,
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

    #[sqlx::test]
    async fn creates_a_full_account_with_an_email(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let account = repository
            .create(NewAccount::full("Ada").with_email("ada@example.com"))
            .await
            .unwrap();

        assert_eq!(account.display_name, "Ada");
        assert_eq!(account.r#type, AccountType::Full);
        assert_eq!(account.email.as_deref(), Some("ada@example.com"));
        // A fresh account has never been seen after its creation.
        assert_eq!(account.last_seen_at, account.created_at);
    }

    #[sqlx::test]
    async fn creates_a_guest_without_an_email(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let account = repository.create(NewAccount::guest("Guest")).await.unwrap();

        assert_eq!(account.r#type, AccountType::Guest);
        assert_eq!(account.email, None);
    }

    #[sqlx::test]
    async fn get_returns_the_created_account(pool: PgPool) {
        let repository = AccountRepository::new(pool);
        let created = repository.create(NewAccount::full("Grace")).await.unwrap();

        let found = repository.get(created.id).await.unwrap();

        assert_eq!(found, Some(created));
    }

    #[sqlx::test]
    async fn get_returns_none_for_an_unknown_id(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let found = repository.get(Uuid::new_v4()).await.unwrap();

        assert_eq!(found, None);
    }

    /// v1 has no username: two accounts may share a display name.
    #[sqlx::test]
    async fn display_names_are_not_unique(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let first = repository.create(NewAccount::full("Ada")).await.unwrap();
        let second = repository.create(NewAccount::full("Ada")).await.unwrap();

        assert_ne!(first.id, second.id);
    }
}
