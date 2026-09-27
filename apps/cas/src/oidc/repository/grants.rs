//! Data access for `grants` and `refresh_tokens`: what a code exchange
//! writes, what a refresh reads, retires and writes (ADR 0012), and the
//! revocations: of a replayed code's grants, of a reused token's grant, and
//! of every grant of an account.

use std::time::Duration;

use sqlx::PgConnection;
use uuid::Uuid;

use crate::clients::{ClientId, Scope};
use crate::oidc::tokens::RefreshTokenHash;

/// What a grant is created with.
#[derive(Debug)]
pub(in crate::oidc) struct NewGrant<'a> {
    pub account_id: Uuid,
    pub client_id: &'a ClientId,
    pub scopes: &'a [Scope],
    /// The code the grant was exchanged for; `None` for a grant no code
    /// produced (the guest grant, #746).
    pub authorization_code_id: Option<Uuid>,
    /// The absolute cap, from now.
    pub lifetime: Duration,
}

/// Inserts a grant and returns its id. `expires_at` is measured by the
/// database clock (ADR 0002 (d)), as for a code.
pub(in crate::oidc) async fn insert_grant<'e, E>(
    executor: E,
    grant: NewGrant<'_>,
) -> Result<Uuid, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let scopes: Vec<String> = grant.scopes.iter().map(|scope| scope.to_string()).collect();

    sqlx::query_scalar!(
        r#"INSERT INTO grants (account_id, client_id, scopes, authorization_code_id, expires_at)
           VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))
           RETURNING id"#,
        grant.account_id,
        grant.client_id as _,
        &scopes,
        grant.authorization_code_id,
        grant.lifetime.as_secs_f64(),
    )
    .fetch_one(executor)
    .await
}

/// Inserts a refresh token of `grant_id` and returns its id. The token's
/// expiry is the grant's, copied in the same statement: a token never
/// outlives its grant, and no token can move the grant's cap.
pub(in crate::oidc) async fn insert_refresh_token<'e, E>(
    executor: E,
    grant_id: Uuid,
    token_hash: &RefreshTokenHash,
) -> Result<Uuid, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query_scalar!(
        r#"INSERT INTO refresh_tokens (grant_id, token_hash, expires_at)
           SELECT id, $2, expires_at FROM grants WHERE id = $1
           RETURNING id"#,
        grant_id,
        token_hash.as_bytes(),
    )
    .fetch_one(executor)
    .await
}

/// Revokes every live grant the code with this id produced, and returns how
/// many there were: what a replayed code calls for (RFC 6749 §4.1.2). A
/// grant revoked before keeps the moment it was first revoked.
pub(in crate::oidc) async fn revoke_grants_by_code<'e, E>(
    executor: E,
    authorization_code_id: Uuid,
) -> Result<u64, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let result = sqlx::query!(
        r#"UPDATE grants SET revoked_at = now()
           WHERE authorization_code_id = $1 AND revoked_at IS NULL"#,
        authorization_code_id,
    )
    .execute(executor)
    .await?;

    Ok(result.rows_affected())
}

/// A refresh token that is live, with what its grant holds, both rows
/// locked by the caller's transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::oidc) struct LiveToken {
    pub token_id: Uuid,
    pub grant_id: Uuid,
    pub account_id: Uuid,
    pub client_id: ClientId,
    pub scopes: Vec<Scope>,
}

/// What a presented refresh token turned out to be.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::oidc) enum Presented {
    /// Not used, not expired, its grant neither revoked nor expired.
    Live(LiveToken),
    /// No token has this hash, or its grant was deleted while the lookup ran.
    Unknown,
    /// The token or its grant is past its expiry.
    Expired,
    /// The grant was revoked; the token was never used.
    Revoked { grant_id: Uuid },
    /// The token was retired by an earlier rotation: presenting it again is
    /// a theft signal, whatever else is true of it (ADR 0012 (b)).
    AlreadyUsed { grant_id: Uuid },
}

/// Finds the refresh token with this hash and locks its grant, then the
/// token, on the caller's transaction, and says what it found. Three
/// statements, in this order:
///
/// 1. the token's grant id, unlocked: a token never moves to another grant,
///    so the value cannot be stale;
/// 2. the grant, `FOR UPDATE`;
/// 3. the token, `FOR UPDATE`, read after the grant lock, so it sees the
///    `used_at` of a rotation that held the lock before.
///
/// The grant first, because that is the order every cascade takes: deleting
/// an account or a grant locks the grant and then deletes its tokens. Taking
/// the token first would let a rotation and a delete each hold what the
/// other waits for. Every writer of a grant's tokens holds the grant row
/// first, so the grant lock alone orders a rotation against a concurrent
/// revocation or rotation; the token lock keeps the order explicit (ADR
/// 0012 (b)).
///
/// Nothing is written: the caller decides, once it has checked the client,
/// whether the token is spent.
pub(in crate::oidc) async fn lock_refresh_token(
    conn: &mut PgConnection,
    hash: &RefreshTokenHash,
) -> Result<Presented, sqlx::Error> {
    let Some(found) = sqlx::query!(
        r#"SELECT id, grant_id FROM refresh_tokens WHERE token_hash = $1"#,
        hash.as_bytes(),
    )
    .fetch_optional(&mut *conn)
    .await?
    else {
        return Ok(Presented::Unknown);
    };
    let grant_id = found.grant_id;

    let Some(grant) = sqlx::query!(
        r#"SELECT
               account_id,
               client_id AS "client_id: ClientId",
               scopes,
               revoked_at IS NOT NULL AS "revoked!",
               expires_at <= now() AS "expired!"
           FROM grants
           WHERE id = $1
           FOR UPDATE"#,
        grant_id,
    )
    .fetch_optional(&mut *conn)
    .await?
    else {
        return Ok(Presented::Unknown);
    };

    let Some(token) = sqlx::query!(
        r#"SELECT
               used_at IS NOT NULL AS "used!",
               expires_at <= now() AS "expired!"
           FROM refresh_tokens
           WHERE id = $1
           FOR UPDATE"#,
        found.id,
    )
    .fetch_optional(&mut *conn)
    .await?
    else {
        return Ok(Presented::Unknown);
    };

    Ok(if token.used {
        Presented::AlreadyUsed { grant_id }
    } else if grant.revoked {
        Presented::Revoked { grant_id }
    } else if token.expired || grant.expired {
        Presented::Expired
    } else {
        Presented::Live(LiveToken {
            token_id: found.id,
            grant_id,
            account_id: grant.account_id,
            client_id: grant.client_id,
            scopes: super::scopes(grant.scopes)?,
        })
    })
}

/// Marks a refresh token used. The row stays until its expiry, so that a
/// second presentation is recognised as a reuse (ADR 0011 (d)).
pub(in crate::oidc) async fn retire_refresh_token<'e, E>(
    executor: E,
    token_id: Uuid,
) -> Result<(), sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query!(
        r#"UPDATE refresh_tokens SET used_at = now() WHERE id = $1"#,
        token_id,
    )
    .execute(executor)
    .await?;
    Ok(())
}

/// Records that a grant was just used. Informational: the grant's expiry is
/// absolute and does not move (ADR 0012 (g)).
pub(in crate::oidc) async fn touch_grant<'e, E>(
    executor: E,
    grant_id: Uuid,
) -> Result<(), sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query!(
        r#"UPDATE grants SET last_used_at = now() WHERE id = $1"#,
        grant_id,
    )
    .execute(executor)
    .await?;
    Ok(())
}

/// Revokes one grant, and with it every refresh token under it. Returns
/// whether this call revoked it; a grant revoked before keeps the moment it
/// was first revoked.
pub(in crate::oidc) async fn revoke_grant<'e, E>(
    executor: E,
    grant_id: Uuid,
) -> Result<bool, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let result = sqlx::query!(
        r#"UPDATE grants SET revoked_at = now()
           WHERE id = $1 AND revoked_at IS NULL"#,
        grant_id,
    )
    .execute(executor)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Revokes every live grant of an account in one statement, and returns how
/// many there were (ADR 0012 (h)). A grant revoked before keeps the moment it
/// was first revoked.
pub(in crate::oidc) async fn revoke_grants_of_account<'e, E>(
    executor: E,
    account_id: Uuid,
) -> Result<u64, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let result = sqlx::query!(
        r#"UPDATE grants SET revoked_at = now()
           WHERE account_id = $1 AND revoked_at IS NULL"#,
        account_id,
    )
    .execute(executor)
    .await?;

    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use sqlx::{PgPool, Row};
    use time::OffsetDateTime;

    use super::*;
    use crate::oidc::REFRESH_TOKEN_LIFETIME;
    use crate::oidc::repository::tests::{Fixture, fixture, hash, insert_code, scope_list};
    use crate::oidc::tokens::RefreshToken;

    /// A fixture with a code, and a grant exchanged for it.
    struct Granted {
        fixture: Fixture,
        code_id: Uuid,
        grant_id: Uuid,
    }

    async fn granted(pool: &PgPool) -> Granted {
        let fixture = fixture(pool).await;
        let code_id = insert_code(pool, &fixture, &hash()).await;
        let grant_id = grant(pool, &fixture, Some(code_id)).await;
        Granted {
            fixture,
            code_id,
            grant_id,
        }
    }

    async fn grant(pool: &PgPool, fixture: &Fixture, code_id: Option<Uuid>) -> Uuid {
        insert_grant(
            pool,
            NewGrant {
                account_id: fixture.account_id,
                client_id: &fixture.client_id,
                scopes: &scope_list(),
                authorization_code_id: code_id,
                lifetime: REFRESH_TOKEN_LIFETIME,
            },
        )
        .await
        .unwrap()
    }

    async fn count(pool: &PgPool, table: &str) -> i64 {
        // A table name cannot be a parameter, so one literal per table.
        let query = match table {
            "grants" => "SELECT count(*) FROM grants",
            "refresh_tokens" => "SELECT count(*) FROM refresh_tokens",
            other => panic!("no count query for {other}"),
        };
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar(query).fetch_one(pool).await.unwrap()
    }

    async fn revoked_at(pool: &PgPool, grant_id: Uuid) -> Option<OffsetDateTime> {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT revoked_at FROM grants WHERE id = $1")
            .bind(grant_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn a_grant_is_stored_with_its_code_its_scopes_and_a_30_day_cap(pool: PgPool) {
        let Granted {
            fixture,
            code_id,
            grant_id,
        } = granted(&pool).await;

        // Unchecked query: see docs/TESTS.md.
        let row = sqlx::query(
            "SELECT account_id, client_id, scopes, authorization_code_id, created_at,
                    last_used_at, expires_at, revoked_at
             FROM grants WHERE id = $1",
        )
        .bind(grant_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(row.get::<Uuid, _>("account_id"), fixture.account_id);
        assert_eq!(row.get::<String, _>("client_id"), "ligretto");
        assert_eq!(row.get::<Vec<String>, _>("scopes"), ["openid", "profile"]);
        assert_eq!(
            row.get::<Option<Uuid>, _>("authorization_code_id"),
            Some(code_id)
        );
        let created_at: OffsetDateTime = row.get("created_at");
        assert_eq!(row.get::<OffsetDateTime, _>("last_used_at"), created_at);
        assert_eq!(
            row.get::<OffsetDateTime, _>("expires_at") - created_at,
            time::Duration::days(30)
        );
        assert_eq!(row.get::<Option<OffsetDateTime>, _>("revoked_at"), None);
    }

    #[sqlx::test]
    async fn a_refresh_token_is_stored_as_its_hash_with_the_grants_expiry(pool: PgPool) {
        let Granted { grant_id, .. } = granted(&pool).await;
        let token = RefreshToken::generate().unwrap();

        let id = insert_refresh_token(&pool, grant_id, &token.hash())
            .await
            .unwrap();

        // Unchecked query: see docs/TESTS.md.
        let row = sqlx::query(
            "SELECT t.grant_id, t.token_hash, t.expires_at, t.used_at, g.expires_at AS cap
             FROM refresh_tokens t JOIN grants g ON g.id = t.grant_id
             WHERE t.id = $1",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.get::<Uuid, _>("grant_id"), grant_id);
        assert_eq!(row.get::<Vec<u8>, _>("token_hash"), token.hash().as_bytes());
        assert_eq!(
            row.get::<OffsetDateTime, _>("expires_at"),
            row.get::<OffsetDateTime, _>("cap")
        );
        assert_eq!(row.get::<Option<OffsetDateTime>, _>("used_at"), None);
    }

    #[sqlx::test]
    async fn a_refresh_token_hash_is_unique(pool: PgPool) {
        let Granted { grant_id, .. } = granted(&pool).await;
        let hash = RefreshToken::generate().unwrap().hash();
        insert_refresh_token(&pool, grant_id, &hash).await.unwrap();

        let error = insert_refresh_token(&pool, grant_id, &hash)
            .await
            .unwrap_err();

        assert!(
            matches!(&error, sqlx::Error::Database(db) if db.is_unique_violation()),
            "{error:?}"
        );
    }

    /// Only the grants of the replayed code, and only once: a second
    /// revocation finds nothing and keeps the first moment.
    #[sqlx::test]
    async fn revoking_by_code_revokes_that_codes_grants_once(pool: PgPool) {
        let Granted {
            fixture,
            code_id,
            grant_id,
        } = granted(&pool).await;
        let other_code = insert_code(&pool, &fixture, &hash()).await;
        let other = grant(&pool, &fixture, Some(other_code)).await;
        let codeless = grant(&pool, &fixture, None).await;

        assert_eq!(revoke_grants_by_code(&pool, code_id).await.unwrap(), 1);

        let first = revoked_at(&pool, grant_id).await.expect("revoked");
        assert_eq!(revoked_at(&pool, other).await, None);
        assert_eq!(revoked_at(&pool, codeless).await, None);

        assert_eq!(revoke_grants_by_code(&pool, code_id).await.unwrap(), 0);
        assert_eq!(revoked_at(&pool, grant_id).await, Some(first));
    }

    async fn with_refresh_token(pool: &PgPool) -> Granted {
        let granted = granted(pool).await;
        insert_refresh_token(
            pool,
            granted.grant_id,
            &RefreshToken::generate().unwrap().hash(),
        )
        .await
        .unwrap();
        granted
    }

    #[sqlx::test]
    async fn deleting_the_account_deletes_its_grants_and_tokens(pool: PgPool) {
        let Granted { fixture, .. } = with_refresh_token(&pool).await;

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(fixture.account_id)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(count(&pool, "grants").await, 0);
        assert_eq!(count(&pool, "refresh_tokens").await, 0);
    }

    #[sqlx::test]
    async fn deleting_the_client_deletes_its_grants_and_tokens(pool: PgPool) {
        with_refresh_token(&pool).await;

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM clients WHERE id = 'ligretto'")
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(count(&pool, "grants").await, 0);
        assert_eq!(count(&pool, "refresh_tokens").await, 0);
    }

    #[sqlx::test]
    async fn deleting_a_grant_deletes_its_tokens(pool: PgPool) {
        let Granted { grant_id, .. } = with_refresh_token(&pool).await;

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM grants WHERE id = $1")
            .bind(grant_id)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(count(&pool, "refresh_tokens").await, 0);
    }

    /// The scheduled cleanup removing a code leaves the grant it produced
    /// alive; only the link to the code goes.
    #[sqlx::test]
    async fn deleting_the_code_keeps_the_grant(pool: PgPool) {
        let Granted {
            code_id, grant_id, ..
        } = with_refresh_token(&pool).await;

        // Unchecked queries: see docs/TESTS.md.
        sqlx::query("DELETE FROM authorization_codes WHERE id = $1")
            .bind(code_id)
            .execute(&pool)
            .await
            .unwrap();
        let link: Option<Uuid> =
            sqlx::query_scalar("SELECT authorization_code_id FROM grants WHERE id = $1")
                .bind(grant_id)
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(link, None);
        assert_eq!(count(&pool, "refresh_tokens").await, 1);
    }

    /// A granted fixture with one refresh token, and that token.
    async fn with_token(pool: &PgPool) -> (Granted, RefreshToken, Uuid) {
        let granted = granted(pool).await;
        let token = RefreshToken::generate().unwrap();
        let token_id = insert_refresh_token(pool, granted.grant_id, &token.hash())
            .await
            .unwrap();
        (granted, token, token_id)
    }

    /// [`lock_refresh_token`] on a connection of its own, as the repository
    /// tests need no transaction around it.
    async fn lock_on(pool: &PgPool, token: &RefreshToken) -> Presented {
        lock_refresh_token(&mut pool.acquire().await.unwrap(), &token.hash())
            .await
            .unwrap()
    }

    async fn execute(pool: &PgPool, sql: &'static str, id: Uuid) {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(sql).bind(id).execute(pool).await.unwrap();
    }

    #[sqlx::test]
    async fn a_live_token_is_found_with_its_grant(pool: PgPool) {
        let (granted, token, token_id) = with_token(&pool).await;

        assert_eq!(
            lock_on(&pool, &token).await,
            Presented::Live(LiveToken {
                token_id,
                grant_id: granted.grant_id,
                account_id: granted.fixture.account_id,
                client_id: granted.fixture.client_id.clone(),
                scopes: scope_list(),
            })
        );
    }

    #[sqlx::test]
    async fn an_unknown_token_is_unknown(pool: PgPool) {
        with_token(&pool).await;

        assert_eq!(
            lock_on(&pool, &RefreshToken::generate().unwrap()).await,
            Presented::Unknown
        );
    }

    #[sqlx::test]
    async fn an_expired_token_or_grant_is_expired(pool: PgPool) {
        let (granted, token, token_id) = with_token(&pool).await;
        execute(
            &pool,
            "UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE id = $1",
            token_id,
        )
        .await;
        assert_eq!(lock_on(&pool, &token).await, Presented::Expired);

        let other_grant = grant(&pool, &granted.fixture, None).await;
        let other = RefreshToken::generate().unwrap();
        insert_refresh_token(&pool, other_grant, &other.hash())
            .await
            .unwrap();
        execute(
            &pool,
            "UPDATE grants SET expires_at = now() - interval '1 second' WHERE id = $1",
            other_grant,
        )
        .await;
        assert_eq!(lock_on(&pool, &other).await, Presented::Expired);
    }

    #[sqlx::test]
    async fn a_token_of_a_revoked_grant_is_revoked(pool: PgPool) {
        let (granted, token, _) = with_token(&pool).await;
        assert!(revoke_grant(&pool, granted.grant_id).await.unwrap());

        assert_eq!(
            lock_on(&pool, &token).await,
            Presented::Revoked {
                grant_id: granted.grant_id
            }
        );
    }

    /// A retired token is a reuse whatever else is true of it: its grant
    /// revoked or expired changes nothing, so a second reuse is reported
    /// (and revokes, idempotently) like the first.
    #[sqlx::test]
    async fn a_retired_token_is_already_used_before_anything_else(pool: PgPool) {
        let (granted, token, token_id) = with_token(&pool).await;
        let grant_id = granted.grant_id;
        retire_refresh_token(&pool, token_id).await.unwrap();
        assert_eq!(
            lock_on(&pool, &token).await,
            Presented::AlreadyUsed { grant_id }
        );

        revoke_grant(&pool, grant_id).await.unwrap();
        execute(
            &pool,
            "UPDATE grants SET expires_at = now() - interval '1 second' WHERE id = $1",
            grant_id,
        )
        .await;
        assert_eq!(
            lock_on(&pool, &token).await,
            Presented::AlreadyUsed { grant_id }
        );
    }

    #[sqlx::test]
    async fn retiring_a_token_and_touching_the_grant_record_the_moment(pool: PgPool) {
        let (granted, _, token_id) = with_token(&pool).await;
        execute(
            &pool,
            "UPDATE grants SET last_used_at = created_at - interval '1 hour' WHERE id = $1",
            granted.grant_id,
        )
        .await;

        retire_refresh_token(&pool, token_id).await.unwrap();
        touch_grant(&pool, granted.grant_id).await.unwrap();

        // Unchecked queries: see docs/TESTS.md.
        let used_at: Option<OffsetDateTime> =
            sqlx::query_scalar("SELECT used_at FROM refresh_tokens WHERE id = $1")
                .bind(token_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        let (created_at, last_used_at): (OffsetDateTime, OffsetDateTime) =
            sqlx::query_as("SELECT created_at, last_used_at FROM grants WHERE id = $1")
                .bind(granted.grant_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(used_at.is_some());
        assert!(last_used_at >= created_at, "{last_used_at} {created_at}");
    }

    #[sqlx::test]
    async fn revoking_a_grant_revokes_it_once(pool: PgPool) {
        let Granted {
            fixture, grant_id, ..
        } = granted(&pool).await;
        let other = grant(&pool, &fixture, None).await;

        assert!(revoke_grant(&pool, grant_id).await.unwrap());
        let first = revoked_at(&pool, grant_id).await.expect("revoked");
        assert_eq!(revoked_at(&pool, other).await, None);

        assert!(!revoke_grant(&pool, grant_id).await.unwrap());
        assert_eq!(revoked_at(&pool, grant_id).await, Some(first));
    }

    /// The acceptance criterion: one call revokes every grant of the
    /// account, and nobody else's.
    #[sqlx::test]
    async fn revoking_the_account_revokes_every_grant_of_it_only(pool: PgPool) {
        let Granted {
            fixture, grant_id, ..
        } = granted(&pool).await;
        let second = grant(&pool, &fixture, None).await;
        let someone = crate::accounts::AccountRepository::new(pool.clone())
            .create(crate::accounts::NewAccount::full(
                crate::testing::display_name("Bob"),
            ))
            .await
            .unwrap();
        let theirs = grant(
            &pool,
            &Fixture {
                account_id: someone.id,
                ..fixture
            },
            None,
        )
        .await;
        let account_id = granted_account(&pool, grant_id).await;

        assert_eq!(
            revoke_grants_of_account(&pool, account_id).await.unwrap(),
            2
        );

        let first = revoked_at(&pool, grant_id).await.expect("revoked");
        assert!(revoked_at(&pool, second).await.is_some());
        assert_eq!(revoked_at(&pool, theirs).await, None);

        assert_eq!(
            revoke_grants_of_account(&pool, account_id).await.unwrap(),
            0
        );
        assert_eq!(revoked_at(&pool, grant_id).await, Some(first));
    }

    async fn granted_account(pool: &PgPool, grant_id: Uuid) -> Uuid {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT account_id FROM grants WHERE id = $1")
            .bind(grant_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }
}
