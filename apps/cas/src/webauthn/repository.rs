//! Data access for the WebAuthn context: `webauthn_ceremonies` and
//! `passkey_credentials`. Every query of the context is here; the domain
//! modules ([`ceremonies`](super::ceremonies), [`passkeys`](super::passkeys)) only
//! name the rows and their rules.
//!
//! A ceremony row is single-use. [`take_ceremony`] deletes it in the same
//! statement that reads it, so a challenge answers exactly one request even
//! when two finishes race, and it is the caller's transaction that decides
//! whether the deletion sticks.

use sqlx::{PgConnection, PgPool, types::Json};
use time::OffsetDateTime;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

use crate::accounts::{self, Account, NewAccount};
use crate::webauthn::ceremonies::{Ceremony, CeremonyKind, Taken};
use crate::webauthn::passkeys::{CreateError, PasskeyCredential};
use crate::webauthn::{CEREMONY_GRACE, CEREMONY_TIMEOUT};

// Ceremonies ---------------------------------------------------------------

/// Stores a ceremony and returns its id. The row lives for
/// [`CEREMONY_TIMEOUT`] plus [`CEREMONY_GRACE`], measured by the database
/// clock so that every replica agrees on it.
///
/// Starting removes nothing: a row past its `expires_at` is ignored by
/// [`take_ceremony`] and stays until a separate cleanup deletes it, so
/// housekeeping never sits in the request path. See
/// `docs/adr/0002-ceremony-state-in-postgres.md`.
pub async fn start_ceremony<'e, E, T>(executor: E, state: &T) -> Result<Uuid, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
    T: Ceremony,
{
    let id = Uuid::new_v4();
    let state =
        serde_json::to_value(state).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
    let ttl_secs = (CEREMONY_TIMEOUT + CEREMONY_GRACE).as_secs_f64();

    sqlx::query!(
        r#"INSERT INTO webauthn_ceremonies (id, kind, state, expires_at)
           VALUES ($1, $2, $3, now() + make_interval(secs => $4))"#,
        id,
        T::KIND as CeremonyKind,
        state,
        ttl_secs,
    )
    .execute(executor)
    .await?;

    Ok(id)
}

/// Consumes a ceremony: returns its state and deletes the row in one
/// statement. Run it inside the transaction that finishes the ceremony, so a
/// failure later in that transaction leaves the row in place for a retry.
///
/// A row whose state no longer deserialises is discarded rather than reported
/// as an error: it can only be a state shape that changed under a rollout, the
/// row is worthless either way, and letting the deletion stand is what stops it
/// from failing every retry until it expires. The caller must commit for that
/// to hold — see [`Taken::Undecodable`].
pub async fn take_ceremony<'e, E, T>(executor: E, id: Uuid) -> Result<Taken<T>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
    T: Ceremony,
{
    let row = sqlx::query!(
        r#"DELETE FROM webauthn_ceremonies
           WHERE id = $1 AND kind = $2 AND expires_at > now()
           RETURNING state"#,
        id,
        T::KIND as CeremonyKind,
    )
    .fetch_optional(executor)
    .await?;

    let Some(row) = row else {
        return Ok(Taken::Missing);
    };

    match serde_json::from_value(row.state) {
        Ok(state) => Ok(Taken::Found(state)),
        Err(error) => {
            tracing::warn!(
                ceremony_id = %id,
                error = %error,
                "discarding a ceremony whose stored state no longer deserialises"
            );
            Ok(Taken::Undecodable)
        }
    }
}

// Passkeys -----------------------------------------------------------------

/// Name Postgres gives the `UNIQUE` constraint on `credential_id`.
const CREDENTIAL_ID_UNIQUE: &str = "passkey_credentials_credential_id_key";

/// The constraint name is the database's way of saying "already registered";
/// only the queries here know it, so the mapping lives next to them.
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
pub async fn create_passkey_with_account(
    conn: &mut PgConnection,
    account: NewAccount,
    passkey: &Passkey,
    name: &str,
) -> Result<(Account, PasskeyCredential), CreateError> {
    let account = accounts::insert(&mut *conn, account).await?;
    let credential = insert_passkey(&mut *conn, account.id, passkey, name).await?;
    Ok((account, credential))
}

/// Inserts a credential with any executor, so it can join the transaction that
/// also creates the account.
async fn insert_passkey<'e, E>(
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
mod ceremony_tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use sqlx::postgres::types::PgInterval;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct State {
        value: u32,
    }

    impl Ceremony for State {
        const KIND: CeremonyKind = CeremonyKind::Registration;
    }

    /// A state of the other kind, so a mismatch can be provoked without
    /// passing the kind by hand.
    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct LoginState {
        value: u32,
    }

    impl Ceremony for LoginState {
        const KIND: CeremonyKind = CeremonyKind::Authentication;
    }

    /// Moves a ceremony's expiry into the past. Unchecked query: see
    /// docs/TESTS.md.
    async fn expire(pool: &PgPool, id: Uuid) {
        sqlx::query(
            "UPDATE webauthn_ceremonies SET expires_at = now() - interval '1 second' WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn count(pool: &PgPool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM webauthn_ceremonies")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn take_returns_the_state_once(pool: PgPool) {
        let id = start_ceremony(&pool, &State { value: 7 }).await.unwrap();

        let first: Taken<State> = take_ceremony(&pool, id).await.unwrap();
        let second: Taken<State> = take_ceremony(&pool, id).await.unwrap();

        assert_eq!(first, Taken::Found(State { value: 7 }));
        assert_eq!(second, Taken::Missing);
    }

    #[sqlx::test]
    async fn take_is_missing_for_an_unknown_id(pool: PgPool) {
        let state: Taken<State> = take_ceremony(&pool, Uuid::new_v4()).await.unwrap();

        assert_eq!(state, Taken::Missing);
    }

    #[sqlx::test]
    async fn take_is_missing_for_another_kind(pool: PgPool) {
        let id = start_ceremony(&pool, &State { value: 7 }).await.unwrap();

        let state: Taken<LoginState> = take_ceremony(&pool, id).await.unwrap();

        assert_eq!(state, Taken::Missing);
        // Still there for the right kind: the mismatch consumed nothing.
        assert_eq!(count(&pool).await, 1);
    }

    #[sqlx::test]
    async fn an_expired_ceremony_cannot_be_taken(pool: PgPool) {
        let id = start_ceremony(&pool, &State { value: 7 }).await.unwrap();
        expire(&pool, id).await;

        let state: Taken<State> = take_ceremony(&pool, id).await.unwrap();

        assert_eq!(state, Taken::Missing);
    }

    /// A state shape that changed under a rollout: the row is discarded, not
    /// reported as an error, so it cannot poison every retry until it expires.
    #[sqlx::test]
    async fn an_undecodable_state_is_discarded(pool: PgPool) {
        let id = Uuid::new_v4();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "INSERT INTO webauthn_ceremonies (id, kind, state, expires_at) VALUES ($1, 'registration', '{\"nope\": 1}'::jsonb, now() + interval '5 minutes')",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();

        let taken: Taken<State> = take_ceremony(&pool, id).await.unwrap();

        assert_eq!(taken, Taken::Undecodable);
        assert_eq!(count(&pool).await, 0, "the row is gone, not left to rot");
    }

    /// The row must outlive the challenge the browser is counting down, or the
    /// server gives up first and the credential the authenticator just created
    /// is orphaned.
    #[sqlx::test]
    async fn a_ceremony_lives_for_the_timeout_plus_the_grace(pool: PgPool) {
        let id = start_ceremony(&pool, &State { value: 7 }).await.unwrap();

        // Unchecked query: see docs/TESTS.md.
        let lifetime: PgInterval = sqlx::query_scalar(
            "SELECT expires_at - created_at FROM webauthn_ceremonies WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(
            lifetime,
            PgInterval {
                months: 0,
                days: 0,
                microseconds: (CEREMONY_TIMEOUT + CEREMONY_GRACE).as_micros() as i64,
            }
        );
    }

    /// Inside a transaction, a rollback puts the ceremony back: a finish that
    /// fails after consuming the state can be retried.
    #[sqlx::test]
    async fn a_rolled_back_take_keeps_the_ceremony(pool: PgPool) {
        let id = start_ceremony(&pool, &State { value: 7 }).await.unwrap();

        let mut tx = pool.begin().await.unwrap();
        let taken: Taken<State> = take_ceremony(&mut *tx, id).await.unwrap();
        assert_eq!(taken, Taken::Found(State { value: 7 }));
        tx.rollback().await.unwrap();

        let again: Taken<State> = take_ceremony(&pool, id).await.unwrap();
        assert_eq!(again, Taken::Found(State { value: 7 }));
    }
}

#[cfg(test)]
mod passkey_tests {
    use super::*;
    use crate::accounts::{AccountRepository, AccountType};
    use crate::testing::{display_name, test_passkey};
    use crate::webauthn::passkeys::DEFAULT_PASSKEY_NAME;

    /// Runs the free function in a transaction of its own and commits it, the
    /// way registration's wider transaction eventually does.
    async fn create_committed(
        pool: &PgPool,
        account: NewAccount,
        passkey: &Passkey,
    ) -> Result<(Account, PasskeyCredential), CreateError> {
        let mut tx = pool.begin().await.unwrap();
        let created =
            create_passkey_with_account(&mut tx, account, passkey, DEFAULT_PASSKEY_NAME).await?;
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
        assert_eq!(account.display_name.as_ref(), "Ada");
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
        let error = create_passkey_with_account(
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
