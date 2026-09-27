//! Data access for `grants` and `refresh_tokens`: what a code exchange
//! writes, and the revocation a replayed code triggers. Refresh (#744) will
//! read what is written here.

use std::time::Duration;

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
}
