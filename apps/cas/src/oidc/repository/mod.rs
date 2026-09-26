//! Data access for `authorization_codes`, and through [`grants`] for
//! `grants` and `refresh_tokens`. Every query of the context is under this
//! directory; the functions take an executor — `redeem`, which runs two
//! statements, a connection — so a service can compose a transaction out of
//! them.

mod grants;

use std::time::Duration;

use uuid::Uuid;

use super::codes::{CodeChallenge, CodeHash};
use crate::clients::{ClientId, Scope};

pub(super) use grants::{NewGrant, insert_grant, insert_refresh_token, revoke_grants_by_code};

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
    /// The row was redeemed before: a replay. Carries the row's id, which
    /// is how the grant the first redemption produced is found.
    AlreadyRedeemed(Uuid),
    /// The row was never redeemed and has not expired, but the session that
    /// authorized it is gone: logout voids the codes it had not yet seen
    /// used (ADR 0011 (d)).
    SessionEnded,
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

/// Consumes the code with this hash if it is live: not redeemed, not
/// expired, and its session not ended. The consuming statement is one atomic
/// `UPDATE`, and the row lock it takes is held until the caller's
/// transaction ends: a concurrent redemption waits for it, re-evaluates
/// `redeemed_at IS NULL` on the row the first one wrote, and matches
/// nothing. The row is kept, so a second presentation is recognised as a
/// replay (ADR 0010 (e)) — after the first redemption's transaction, and
/// what it wrote, has committed (ADR 0011 (f)).
///
/// Only when nothing was consumed does a second query ask why, so the happy
/// path is one statement. Both run on `conn`, the caller's transaction.
pub(super) async fn redeem(
    conn: &mut sqlx::PgConnection,
    code_hash: &CodeHash,
) -> Result<Redemption, sqlx::Error> {
    // `session_id!`: the column is nullable (logout unlinks a code rather
    // than deleting it), but the predicate only consumes a row that still
    // has its session.
    let row = sqlx::query!(
        r#"UPDATE authorization_codes
           SET redeemed_at = now()
           WHERE code_hash = $1
             AND redeemed_at IS NULL
             AND expires_at > now()
             AND session_id IS NOT NULL
           RETURNING
               id,
               client_id AS "client_id: ClientId",
               account_id,
               session_id AS "session_id!",
               redirect_uri,
               scopes,
               code_challenge,
               nonce"#,
        code_hash.as_bytes(),
    )
    .fetch_optional(&mut *conn)
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
        r#"SELECT
               id,
               redeemed_at IS NOT NULL AS "redeemed!",
               expires_at <= now() AS "expired!"
           FROM authorization_codes
           WHERE code_hash = $1"#,
        code_hash.as_bytes(),
    )
    .fetch_optional(&mut *conn)
    .await?;

    // The `UPDATE` matched nothing, and each of its conditions can only turn
    // false over time, never back: a row that is neither redeemed nor
    // expired is one whose session has ended.
    Ok(match found {
        None => Redemption::Unknown,
        Some(row) if row.redeemed => Redemption::AlreadyRedeemed(row.id),
        Some(row) if row.expired => Redemption::Expired,
        Some(_) => Redemption::SessionEnded,
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

    pub(crate) fn scope_list() -> Vec<Scope> {
        ["openid", "profile"]
            .map(|scope| Scope::try_new(scope).unwrap())
            .to_vec()
    }

    pub(crate) async fn insert_code(pool: &PgPool, fixture: &Fixture, hash: &CodeHash) -> Uuid {
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

    /// [`redeem`] on a connection of its own, committed as it goes, as the
    /// repository tests need no transaction around it.
    async fn redeem_on(pool: &PgPool, hash: &CodeHash) -> Result<Redemption, sqlx::Error> {
        redeem(&mut pool.acquire().await.unwrap(), hash).await
    }

    pub(crate) fn hash() -> CodeHash {
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

        let redeemed = redeem_on(&pool, &hash).await.unwrap();

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
        let id = insert_code(&pool, &fixture, &hash).await;

        assert!(matches!(
            redeem_on(&pool, &hash).await.unwrap(),
            Redemption::Redeemed(_)
        ));
        assert_eq!(
            redeem_on(&pool, &hash).await.unwrap(),
            Redemption::AlreadyRedeemed(id)
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

        assert_eq!(redeem_on(&pool, &hash).await.unwrap(), Redemption::Expired);
        assert_eq!(times(&pool, id).await.redeemed_at, None);
    }

    #[sqlx::test]
    async fn an_unknown_hash_is_unknown(pool: PgPool) {
        assert_eq!(
            redeem_on(&pool, &hash()).await.unwrap(),
            Redemption::Unknown
        );
    }

    async fn count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM authorization_codes")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Logout unlinks the session's codes rather than deleting them: a
    /// pending one can no longer be redeemed, and a redeemed one stays to
    /// recognise a replay.
    #[sqlx::test]
    async fn deleting_the_session_voids_a_pending_code_and_keeps_a_redeemed_one(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let pending = hash();
        insert_code(&pool, &fixture, &pending).await;
        let redeemed = hash();
        let redeemed_id = insert_code(&pool, &fixture, &redeemed).await;
        assert!(matches!(
            redeem_on(&pool, &redeemed).await.unwrap(),
            Redemption::Redeemed(_)
        ));

        // Unchecked queries: see docs/TESTS.md.
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(fixture.session_id)
            .execute(&pool)
            .await
            .unwrap();
        let linked: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM authorization_codes WHERE session_id IS NOT NULL",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(count(&pool).await, 2);
        assert_eq!(linked, 0);
        assert_eq!(
            redeem_on(&pool, &pending).await.unwrap(),
            Redemption::SessionEnded
        );
        assert_eq!(
            redeem_on(&pool, &redeemed).await.unwrap(),
            Redemption::AlreadyRedeemed(redeemed_id)
        );
    }

    /// Expiry is reported before the ended session: either way the code is
    /// dead, and the clock is the plainer reason.
    #[sqlx::test]
    async fn an_expired_code_of_an_ended_session_is_expired(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hash = hash();
        insert_code(&pool, &fixture, &hash).await;
        // Unchecked queries: see docs/TESTS.md.
        sqlx::query("UPDATE authorization_codes SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM sessions")
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(redeem_on(&pool, &hash).await.unwrap(), Redemption::Expired);
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

        let error = redeem_on(&pool, &hash).await.unwrap_err();

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
            "INSERT INTO clients (id, name, kind, redirect_uris, scopes, audience)
             VALUES ('Not A Slug', 'Bad', 'public', ARRAY['https://x.example/cb'], ARRAY['openid'], 'bad')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE authorization_codes SET client_id = 'Not A Slug'")
            .execute(&pool)
            .await
            .unwrap();

        let error = redeem_on(&pool, &hash).await.unwrap_err();

        assert!(
            matches!(&error, sqlx::Error::ColumnDecode { .. }),
            "{error:?}"
        );
    }
}
