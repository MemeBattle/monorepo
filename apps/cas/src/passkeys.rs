//! Passkey credentials — the WebAuthn authenticators bound to an account.
//!
//! The credential is persisted as the serde form of the webauthn-rs `Passkey`
//! (documented as safe to store) in a jsonb column, with the raw credential id
//! lifted out into its own indexed column because login (#666) has nothing but
//! that id to look the account up by. See
//! `docs/adr/0001-passkey-persistence.md`.

use sqlx::{PgConnection, PgPool, types::Json};
use thiserror::Error;
use time::OffsetDateTime;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

use crate::accounts::{self, Account, NewAccount};

/// Label given to the passkey created during registration. The user has not
/// been asked for one at that point; passkey management (#668) lets them
/// rename it.
pub const DEFAULT_PASSKEY_NAME: &str = "Passkey";

/// Name Postgres gives the `UNIQUE` constraint on `credential_id`.
const CREDENTIAL_ID_UNIQUE: &str = "passkey_credentials_credential_id_key";

/// A row of `passkey_credentials`.
///
/// Deliberately not `PartialEq`: `Passkey` compares credential ids only, so a
/// derived equality would call two rows with different counters or keys
/// equal. Compare fields, or the serde form, explicitly.
#[derive(Debug, Clone)]
pub struct PasskeyCredential {
    pub id: Uuid,
    pub account_id: Uuid,
    /// Raw credential id as the authenticator reports it. Duplicated out of
    /// `passkey` so login can find the row by it.
    pub credential_id: Vec<u8>,
    /// The credential itself: public key, signature counter, backup state,
    /// transports.
    pub passkey: Passkey,
    /// User-facing label.
    pub name: String,
    pub created_at: OffsetDateTime,
    /// `None` until the credential is first used to sign in.
    pub last_used_at: Option<OffsetDateTime>,
}

/// The row as the queries return it: the credential still wrapped for jsonb.
struct PasskeyRow {
    id: Uuid,
    account_id: Uuid,
    credential_id: Vec<u8>,
    credential: Json<Passkey>,
    name: String,
    created_at: OffsetDateTime,
    last_used_at: Option<OffsetDateTime>,
}

impl From<PasskeyRow> for PasskeyCredential {
    fn from(row: PasskeyRow) -> Self {
        Self {
            id: row.id,
            account_id: row.account_id,
            credential_id: row.credential_id,
            passkey: row.credential.0,
            name: row.name,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
        }
    }
}

#[derive(Debug, Error)]
pub enum CreateError {
    /// The credential id is already stored, on this account or another one.
    /// An authenticator must never be registered twice.
    #[error("the credential is already registered")]
    CredentialAlreadyRegistered,

    #[error(transparent)]
    Db(sqlx::Error),
}

impl From<sqlx::Error> for CreateError {
    fn from(error: sqlx::Error) -> Self {
        match &error {
            sqlx::Error::Database(db)
                if db.is_unique_violation() && db.constraint() == Some(CREDENTIAL_ID_UNIQUE) =>
            {
                Self::CredentialAlreadyRegistered
            }
            _ => Self::Db(error),
        }
    }
}

/// Data access for `passkey_credentials`.
#[derive(Debug, Clone)]
pub struct PasskeyRepository {
    pool: PgPool,
}

impl PasskeyRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// All passkeys of an account, oldest first. Powers the management screen
    /// (#668); the stable secondary sort by id keeps the order deterministic
    /// when two credentials share a timestamp.
    pub async fn list_for_account(
        &self,
        account_id: Uuid,
    ) -> Result<Vec<PasskeyCredential>, sqlx::Error> {
        let rows = sqlx::query_as!(
            PasskeyRow,
            r#"SELECT
                   id,
                   account_id,
                   credential_id,
                   credential AS "credential: Json<Passkey>",
                   name,
                   created_at,
                   last_used_at
               FROM passkey_credentials
               WHERE account_id = $1
               ORDER BY created_at, id"#,
            account_id,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }
}

/// Writes an account and its first passkey on the caller's connection, meant
/// to be a transaction: an account without a credential could never be signed
/// into, so both rows are written or neither.
pub async fn create_with_account(
    conn: &mut PgConnection,
    account: NewAccount,
    passkey: &Passkey,
    name: &str,
) -> Result<(Account, PasskeyCredential), CreateError> {
    let account = accounts::insert(&mut *conn, account).await?;
    let credential = insert(&mut *conn, account.id, passkey, name).await?;
    Ok((account, credential))
}

/// Inserts a credential with any executor, so it can join the transaction that
/// also creates the account.
async fn insert<'e, E>(
    executor: E,
    account_id: Uuid,
    passkey: &Passkey,
    name: &str,
) -> Result<PasskeyCredential, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let credential_id: &[u8] = passkey.cred_id().as_ref();

    sqlx::query_as!(
        PasskeyRow,
        r#"INSERT INTO passkey_credentials (account_id, credential_id, credential, name)
           VALUES ($1, $2, $3, $4)
           RETURNING
               id,
               account_id,
               credential_id,
               credential AS "credential: Json<Passkey>",
               name,
               created_at,
               last_used_at"#,
        account_id,
        credential_id,
        Json(passkey) as _,
        name,
    )
    .fetch_one(executor)
    .await
    .map(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::{AccountRepository, AccountType};
    use crate::testing::{display_name, test_passkey};

    /// Runs the free function in a transaction of its own and commits it, the
    /// way registration's wider transaction eventually does.
    async fn create_committed(
        pool: &PgPool,
        account: NewAccount,
        passkey: &Passkey,
    ) -> Result<(Account, PasskeyCredential), CreateError> {
        let mut tx = pool.begin().await.unwrap();
        let created = create_with_account(&mut tx, account, passkey, DEFAULT_PASSKEY_NAME).await?;
        tx.commit().await?;
        Ok(created)
    }

    #[sqlx::test]
    async fn create_with_account_writes_the_account_and_the_credential(pool: PgPool) {
        let passkey = test_passkey();
        let id = Uuid::new_v4();

        let (account, credential) = create_committed(
            &pool,
            NewAccount::full(display_name("Ada")).with_id(id),
            &passkey,
        )
        .await
        .unwrap();

        assert_eq!(account.id, id);
        assert_eq!(account.display_name, "Ada");
        assert_eq!(account.r#type, AccountType::Full);

        assert_eq!(credential.account_id, id);
        assert_eq!(credential.credential_id, passkey.cred_id().as_ref());
        assert_eq!(credential.name, DEFAULT_PASSKEY_NAME);
        assert_eq!(credential.last_used_at, None);

        // The account row is really there, not just returned from memory.
        let stored = AccountRepository::new(pool).get(id).await.unwrap();
        assert_eq!(stored, Some(account));
    }

    #[sqlx::test]
    async fn list_for_account_round_trips_the_passkey(pool: PgPool) {
        let passkey = test_passkey();
        let (account, _) = create_committed(&pool, NewAccount::full(display_name("Ada")), &passkey)
            .await
            .unwrap();

        let repository = PasskeyRepository::new(pool);
        let credentials = repository.list_for_account(account.id).await.unwrap();

        assert_eq!(credentials.len(), 1);
        // `Passkey`'s equality only compares credential ids, so compare the
        // serialized form: that is what proves nothing was lost in jsonb.
        assert_eq!(
            serde_json::to_value(&credentials[0].passkey).unwrap(),
            serde_json::to_value(&passkey).unwrap()
        );
    }

    #[sqlx::test]
    async fn list_for_account_is_empty_for_an_unknown_account(pool: PgPool) {
        let repository = PasskeyRepository::new(pool);

        let credentials = repository.list_for_account(Uuid::new_v4()).await.unwrap();

        assert!(credentials.is_empty());
    }

    /// An authenticator may be registered once. The failed second attempt must
    /// not leave the half-created account behind.
    #[sqlx::test]
    async fn registering_the_same_credential_twice_fails_and_creates_no_account(pool: PgPool) {
        let passkey = test_passkey();
        create_committed(&pool, NewAccount::full(display_name("Ada")), &passkey)
            .await
            .unwrap();

        let second_id = Uuid::new_v4();
        let mut tx = pool.begin().await.unwrap();
        let error = create_with_account(
            &mut tx,
            NewAccount::full(display_name("Ada")).with_id(second_id),
            &passkey,
            DEFAULT_PASSKEY_NAME,
        )
        .await
        .unwrap_err();
        // Dropping the uncommitted transaction rolls the account insert back,
        // which is exactly what the caller must do: the account row is written
        // before the credential fails, so only the rollback keeps it from being
        // orphaned.
        drop(tx);

        assert!(matches!(error, CreateError::CredentialAlreadyRegistered));
        let orphan = AccountRepository::new(pool).get(second_id).await.unwrap();
        assert_eq!(orphan, None);
    }

    #[sqlx::test]
    async fn deleting_an_account_deletes_its_credentials(pool: PgPool) {
        let (account, _) = create_committed(
            &pool,
            NewAccount::full(display_name("Ada")),
            &test_passkey(),
        )
        .await
        .unwrap();

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(account.id)
            .execute(&pool)
            .await
            .unwrap();

        let credentials = PasskeyRepository::new(pool)
            .list_for_account(account.id)
            .await
            .unwrap();
        assert!(credentials.is_empty());
    }
}
