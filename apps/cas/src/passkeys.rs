//! Passkey credentials — the WebAuthn authenticators bound to an account.
//!
//! The credential is persisted as the serde form of the webauthn-rs `Passkey`
//! (documented as safe to store) in a jsonb column, with the raw credential id
//! lifted out into its own indexed column because login (#666) has nothing but
//! that id to look the account up by. See
//! `docs/adr/0001-passkey-persistence.md`.

use sqlx::{PgPool, types::Json};
use time::OffsetDateTime;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

use crate::accounts::{self, Account, NewAccount};

/// Label given to the passkey created during registration. The user has not
/// been asked for one at that point; passkey management (#668) lets them
/// rename it.
pub const DEFAULT_PASSKEY_NAME: &str = "Passkey";

/// A row of `passkey_credentials`.
#[derive(Debug, Clone, PartialEq)]
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

/// Data access for `passkey_credentials`.
#[derive(Debug, Clone)]
pub struct PasskeyRepository {
    pool: PgPool,
}

impl PasskeyRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Creates an account together with its first passkey, in one transaction.
    ///
    /// Registration is the only writer of full accounts, and an account without
    /// a credential could never be signed into — it would be an orphan row that
    /// nothing can reach or clean up. So both rows are written, or neither.
    pub async fn create_with_account(
        &self,
        account: NewAccount,
        passkey: &Passkey,
        name: &str,
    ) -> Result<(Account, PasskeyCredential), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        let account = accounts::insert(&mut *tx, account).await?;
        let credential = insert(&mut *tx, account.id, passkey, name).await?;

        tx.commit().await?;

        Ok((account, credential))
    }

    /// All passkeys of an account, oldest first. Powers the management screen
    /// (#668); the stable secondary sort by id keeps the order deterministic
    /// when two credentials share a timestamp.
    pub async fn list_for_account(
        &self,
        account_id: Uuid,
    ) -> Result<Vec<PasskeyCredential>, sqlx::Error> {
        let rows = sqlx::query!(
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

        Ok(rows
            .into_iter()
            .map(|row| PasskeyCredential {
                id: row.id,
                account_id: row.account_id,
                credential_id: row.credential_id,
                passkey: row.credential.0,
                name: row.name,
                created_at: row.created_at,
                last_used_at: row.last_used_at,
            })
            .collect())
    }
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

    let row = sqlx::query!(
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
    .await?;

    Ok(PasskeyCredential {
        id: row.id,
        account_id: row.account_id,
        credential_id: row.credential_id,
        passkey: row.credential.0,
        name: row.name,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::{AccountRepository, AccountType};
    use webauthn_authenticator_rs::{WebauthnAuthenticator, softpasskey::SoftPasskey};
    use webauthn_rs::prelude::Url;

    /// Runs a full registration ceremony against a software authenticator to
    /// obtain a real `Passkey` — a hand-built one would not prove that the
    /// library's own serde shape survives the round trip through jsonb.
    fn test_passkey() -> Passkey {
        let origin: Url = "http://localhost:5173".parse().unwrap();
        let webauthn = webauthn_rs::WebauthnBuilder::new("localhost", &origin)
            .unwrap()
            .build()
            .unwrap();

        let (ccr, state) = webauthn
            .start_passkey_registration(Uuid::new_v4(), "test", "test", None)
            .unwrap();

        // `falsify_uv = true`: registration requires user verification, which a
        // software authenticator can only claim.
        let response = WebauthnAuthenticator::new(SoftPasskey::new(true))
            .do_registration(origin, ccr)
            .unwrap();

        webauthn
            .finish_passkey_registration(&response, &state)
            .unwrap()
    }

    #[sqlx::test]
    async fn create_with_account_writes_the_account_and_the_credential(pool: PgPool) {
        let repository = PasskeyRepository::new(pool.clone());
        let passkey = test_passkey();
        let id = Uuid::new_v4();

        let (account, credential) = repository
            .create_with_account(
                NewAccount::full("Ada").with_id(id),
                &passkey,
                DEFAULT_PASSKEY_NAME,
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
        let repository = PasskeyRepository::new(pool);
        let passkey = test_passkey();
        let (account, _) = repository
            .create_with_account(NewAccount::full("Ada"), &passkey, DEFAULT_PASSKEY_NAME)
            .await
            .unwrap();

        let credentials = repository.list_for_account(account.id).await.unwrap();

        assert_eq!(credentials.len(), 1);
        assert_eq!(credentials[0].passkey, passkey);
        // `Passkey`'s equality only compares credential ids, so compare the
        // serialized form too: that is what proves nothing was lost in jsonb.
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
        let repository = PasskeyRepository::new(pool.clone());
        let passkey = test_passkey();
        repository
            .create_with_account(NewAccount::full("Ada"), &passkey, DEFAULT_PASSKEY_NAME)
            .await
            .unwrap();

        let second_id = Uuid::new_v4();
        let error = repository
            .create_with_account(
                NewAccount::full("Ada").with_id(second_id),
                &passkey,
                DEFAULT_PASSKEY_NAME,
            )
            .await
            .unwrap_err();

        assert!(matches!(error, sqlx::Error::Database(ref db) if db.is_unique_violation()));
        let orphan = AccountRepository::new(pool).get(second_id).await.unwrap();
        assert_eq!(orphan, None);
    }

    #[sqlx::test]
    async fn deleting_an_account_deletes_its_credentials(pool: PgPool) {
        let repository = PasskeyRepository::new(pool.clone());
        let (account, _) = repository
            .create_with_account(
                NewAccount::full("Ada"),
                &test_passkey(),
                DEFAULT_PASSKEY_NAME,
            )
            .await
            .unwrap();

        // Unchecked query on purpose: CI runs tests with SQLX_OFFLINE=true and
        // `cargo sqlx prepare` does not cache queries from the test target.
        sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(account.id)
            .execute(&pool)
            .await
            .unwrap();

        let credentials = repository.list_for_account(account.id).await.unwrap();
        assert!(credentials.is_empty());
    }
}
