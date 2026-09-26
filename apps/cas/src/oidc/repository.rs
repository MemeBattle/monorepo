//! Data access for `authorization_codes`. Every query of the context is
//! here; the functions take an executor so a service can compose a
//! transaction out of them.

use std::time::Duration;

use uuid::Uuid;

use super::codes::{CodeChallenge, CodeHash};
use crate::clients::{ClientId, Scope};

/// What an insert binds a code to. The hash, never the code.
#[derive(Debug)]
pub(super) struct NewCode<'a> {
    pub code_hash: &'a CodeHash,
    pub client_id: &'a ClientId,
    pub account_id: Uuid,
    pub session_id: Uuid,
    pub redirect_uri: &'a str,
    pub scopes: &'a [Scope],
    pub code_challenge: &'a CodeChallenge,
    pub nonce: Option<&'a str>,
    pub lifetime: Duration,
}

/// A code that was live and has just been consumed, with everything it was
/// bound to, decoded through the domain's newtypes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RedeemedRow {
    pub id: Uuid,
    pub client_id: ClientId,
    pub account_id: Uuid,
    pub session_id: Uuid,
    pub redirect_uri: String,
    pub scopes: Vec<Scope>,
    pub code_challenge: CodeChallenge,
    pub nonce: Option<String>,
}

/// What a redemption found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Redemption {
    /// The code was live; it is consumed now.
    Redeemed(RedeemedRow),
    /// No row has this hash.
    Unknown,
    /// The row exists, was never redeemed, and is past its expiry.
    Expired,
    /// The row was redeemed before: a replay.
    AlreadyRedeemed,
}

/// Inserts a code and returns the row id. `expires_at` is measured by the
/// database clock (ADR 0002 (d)), so every replica agrees on it.
pub(super) async fn insert<'e, E>(executor: E, code: NewCode<'_>) -> Result<Uuid, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let scopes: Vec<String> = code.scopes.iter().map(|scope| scope.to_string()).collect();

    sqlx::query_scalar!(
        r#"INSERT INTO authorization_codes (
               code_hash, client_id, account_id, session_id, redirect_uri,
               scopes, code_challenge, nonce, expires_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(secs => $9))
           RETURNING id"#,
        code.code_hash.as_bytes(),
        code.client_id as _,
        code.account_id,
        code.session_id,
        code.redirect_uri,
        &scopes,
        code.code_challenge.as_str(),
        code.nonce,
        code.lifetime.as_secs_f64(),
    )
    .fetch_one(executor)
    .await
}

/// Consumes the code with this hash if it is live. The consuming statement
/// is one atomic `UPDATE`: two concurrent redemptions take the row lock in
/// turn, and the second re-evaluates `redeemed_at IS NULL` on the row the
/// first just wrote and matches nothing. The row is kept, so a second
/// presentation is recognised as a replay (ADR 0010 (e)).
///
/// Only when nothing was consumed does a second query ask why, so the happy
/// path is one statement.
pub(super) async fn redeem<'e, E>(
    executor: E,
    code_hash: &CodeHash,
) -> Result<Redemption, sqlx::Error>
where
    E: sqlx::PgExecutor<'e> + Copy,
{
    let row = sqlx::query!(
        r#"UPDATE authorization_codes
           SET redeemed_at = now()
           WHERE code_hash = $1 AND redeemed_at IS NULL AND expires_at > now()
           RETURNING
               id,
               client_id AS "client_id: ClientId",
               account_id,
               session_id,
               redirect_uri,
               scopes,
               code_challenge,
               nonce"#,
        code_hash.as_bytes(),
    )
    .fetch_optional(executor)
    .await?;

    if let Some(row) = row {
        return Ok(Redemption::Redeemed(RedeemedRow {
            id: row.id,
            client_id: row.client_id,
            account_id: row.account_id,
            session_id: row.session_id,
            redirect_uri: row.redirect_uri,
            scopes: scopes(row.scopes)?,
            code_challenge: CodeChallenge::try_new(row.code_challenge)
                .map_err(|error| column_decode("code_challenge", error))?,
            nonce: row.nonce,
        }));
    }

    let found = sqlx::query!(
        r#"SELECT redeemed_at FROM authorization_codes WHERE code_hash = $1"#,
        code_hash.as_bytes(),
    )
    .fetch_optional(executor)
    .await?;

    Ok(match found {
        None => Redemption::Unknown,
        Some(row) => match row.redeemed_at {
            Some(_) => Redemption::AlreadyRedeemed,
            None => Redemption::Expired,
        },
    })
}

/// The stored scope strings as the domain's newtype. A value the table holds
/// but the domain refuses — nothing writes one through CAS — becomes a
/// decode error rather than a scope a token is issued for.
fn scopes(values: Vec<String>) -> Result<Vec<Scope>, sqlx::Error> {
    values
        .into_iter()
        .map(|value| Scope::try_new(value).map_err(|error| column_decode("scopes", error)))
        .collect()
}

fn column_decode<E>(column: &str, error: E) -> sqlx::Error
where
    E: std::error::Error + Send + Sync + 'static,
{
    sqlx::Error::ColumnDecode {
        index: column.to_owned(),
        source: Box::new(error),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use sqlx::PgPool;

    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::clients::{ClientName, ClientRepository, NewClient, RedirectUri};
    use crate::oidc::AuthorizationCode;
    use crate::oidc::authorization::tests::{CALLBACK, CHALLENGE};
    use crate::sessions::{SessionOrigin, SessionService, SessionToken};
    use crate::testing::display_name;

    /// An account with a live session and a registered first-party client:
    /// the three rows a code refers to.
    pub(crate) struct Fixture {
        pub client_id: ClientId,
        pub account_id: Uuid,
        pub session_id: Uuid,
        pub token: SessionToken,
    }

    pub(crate) async fn fixture(pool: &PgPool) -> Fixture {
        let client = ClientRepository::new(pool.clone())
            .create(
                NewClient::public(
                    ClientId::try_new("ligretto").unwrap(),
                    ClientName::try_new("Ligretto").unwrap(),
                    vec![RedirectUri::try_new(CALLBACK).unwrap()],
                )
                .unwrap()
                .first_party(true)
                .with_scopes(
                    ["openid", "profile"]
                        .map(|scope| Scope::try_new(scope).unwrap())
                        .to_vec(),
                ),
            )
            .await
            .unwrap();
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let issued = SessionService::new(pool.clone())
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        Fixture {
            client_id: client.id,
            account_id: account.id,
            session_id: issued.session.id,
            token: issued.token,
        }
    }

    fn scope_list() -> Vec<Scope> {
        ["openid", "profile"]
            .map(|scope| Scope::try_new(scope).unwrap())
            .to_vec()
    }

    async fn insert_code(pool: &PgPool, fixture: &Fixture, hash: &CodeHash) -> Uuid {
        insert(
            pool,
            NewCode {
                code_hash: hash,
                client_id: &fixture.client_id,
                account_id: fixture.account_id,
                session_id: fixture.session_id,
                redirect_uri: CALLBACK,
                scopes: &scope_list(),
                code_challenge: &CodeChallenge::try_new(CHALLENGE).unwrap(),
                nonce: Some("n-0S6"),
                lifetime: Duration::from_secs(60),
            },
        )
        .await
        .unwrap()
    }

    /// The row's timestamps, for tests that check what the database recorded.
    #[derive(Debug)]
    struct Times {
        expires_at: time::OffsetDateTime,
        created_at: time::OffsetDateTime,
        redeemed_at: Option<time::OffsetDateTime>,
    }

    async fn times(pool: &sqlx::PgPool, id: Uuid) -> Times {
        use sqlx::Row;

        // Unchecked query: see docs/TESTS.md.
        let row = sqlx::query(
            "SELECT expires_at, created_at, redeemed_at FROM authorization_codes WHERE id = $1",
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap();
        Times {
            expires_at: row.get("expires_at"),
            created_at: row.get("created_at"),
            redeemed_at: row.get("redeemed_at"),
        }
    }

    fn hash() -> CodeHash {
        AuthorizationCode::generate().unwrap().hash()
    }

    #[sqlx::test]
    async fn insert_then_redeem_returns_every_bound_field(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hash = hash();
        let id = insert_code(&pool, &fixture, &hash).await;

        let before = times(&pool, id).await;
        assert_eq!(
            before.expires_at - before.created_at,
            time::Duration::seconds(60)
        );
        assert_eq!(before.redeemed_at, None);

        let redeemed = redeem(&pool, &hash).await.unwrap();

        assert_eq!(
            redeemed,
            Redemption::Redeemed(RedeemedRow {
                id,
                client_id: fixture.client_id.clone(),
                account_id: fixture.account_id,
                session_id: fixture.session_id,
                redirect_uri: CALLBACK.to_owned(),
                scopes: scope_list(),
                code_challenge: CodeChallenge::try_new(CHALLENGE).unwrap(),
                nonce: Some("n-0S6".to_owned()),
            })
        );
        assert!(times(&pool, id).await.redeemed_at.is_some());
    }

    #[sqlx::test]
    async fn a_second_redemption_is_a_replay(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hash = hash();
        insert_code(&pool, &fixture, &hash).await;

        assert!(matches!(
            redeem(&pool, &hash).await.unwrap(),
            Redemption::Redeemed(_)
        ));
        assert_eq!(
            redeem(&pool, &hash).await.unwrap(),
            Redemption::AlreadyRedeemed
        );
    }

    #[sqlx::test]
    async fn an_expired_code_is_not_redeemed(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hash = hash();
        let id = insert_code(&pool, &fixture, &hash).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "UPDATE authorization_codes SET expires_at = now() - interval '1 second' WHERE id = $1",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();

        assert_eq!(redeem(&pool, &hash).await.unwrap(), Redemption::Expired);
        assert_eq!(times(&pool, id).await.redeemed_at, None);
    }

    #[sqlx::test]
    async fn an_unknown_hash_is_unknown(pool: PgPool) {
        assert_eq!(redeem(&pool, &hash()).await.unwrap(), Redemption::Unknown);
    }

    async fn count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM authorization_codes")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn deleting_the_session_deletes_its_codes(pool: PgPool) {
        let fixture = fixture(&pool).await;
        insert_code(&pool, &fixture, &hash()).await;

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(fixture.session_id)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(count(&pool).await, 0);
    }

    #[sqlx::test]
    async fn deleting_the_account_deletes_its_codes(pool: PgPool) {
        let fixture = fixture(&pool).await;
        insert_code(&pool, &fixture, &hash()).await;

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(fixture.account_id)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(count(&pool).await, 0);
    }

    #[sqlx::test]
    async fn a_code_hash_is_unique(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hash = hash();
        insert_code(&pool, &fixture, &hash).await;

        let error = insert(
            &pool,
            NewCode {
                code_hash: &hash,
                client_id: &fixture.client_id,
                account_id: fixture.account_id,
                session_id: fixture.session_id,
                redirect_uri: CALLBACK,
                scopes: &scope_list(),
                code_challenge: &CodeChallenge::try_new(CHALLENGE).unwrap(),
                nonce: None,
                lifetime: Duration::from_secs(60),
            },
        )
        .await
        .unwrap_err();

        assert!(
            matches!(&error, sqlx::Error::Database(db) if db.is_unique_violation()),
            "{error:?}"
        );
    }

    /// A row altered outside CAS is a decode error, never a redeemed code.
    #[sqlx::test]
    async fn a_corrupted_scope_is_a_decode_error(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hash = hash();
        insert_code(&pool, &fixture, &hash).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE authorization_codes SET scopes = ARRAY['openid', 'bad scope']")
            .execute(&pool)
            .await
            .unwrap();

        let error = redeem(&pool, &hash).await.unwrap_err();

        assert!(
            matches!(&error, sqlx::Error::ColumnDecode { index, .. } if index == "scopes"),
            "{error:?}"
        );
    }

    #[sqlx::test]
    async fn a_corrupted_client_id_is_a_decode_error(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hash = hash();
        insert_code(&pool, &fixture, &hash).await;
        // A client row whose id the domain refuses, so the foreign key holds.
        // Unchecked queries: see docs/TESTS.md.
        sqlx::query(
            "INSERT INTO clients (id, name, kind, redirect_uris, scopes)
             VALUES ('Not A Slug', 'Bad', 'public', ARRAY['https://x.example/cb'], ARRAY['openid'])",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE authorization_codes SET client_id = 'Not A Slug'")
            .execute(&pool)
            .await
            .unwrap();

        let error = redeem(&pool, &hash).await.unwrap_err();

        assert!(
            matches!(&error, sqlx::Error::ColumnDecode { .. }),
            "{error:?}"
        );
    }
}
