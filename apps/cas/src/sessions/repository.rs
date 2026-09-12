//! Data access for `sessions`. Every query of the context is here; the
//! functions take an executor so the service can compose a transaction out of
//! them and out of the accounts context's own functions.

use uuid::Uuid;

use super::{SESSION_LIFETIME, Session, TokenHash};

/// Inserts a session for an account. `expires_at` is measured by the
/// database clock so every replica agrees on it.
pub(super) async fn insert<'e, E>(
    executor: E,
    account_id: Uuid,
    token_hash: &TokenHash,
) -> Result<Session, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let ttl_secs = SESSION_LIFETIME.as_secs_f64();

    sqlx::query_as!(
        Session,
        r#"INSERT INTO sessions (account_id, token_hash, expires_at)
           VALUES ($1, $2, now() + make_interval(secs => $3))
           RETURNING id, account_id, created_at, expires_at"#,
        account_id,
        token_hash.as_ref(),
        ttl_secs,
    )
    .fetch_one(executor)
    .await
}

/// The session a token names, if it exists and has not expired. An expired
/// row is the same as no row: it is not returned, and it is not removed here
/// either, so that housekeeping stays out of the request path.
pub(super) async fn find_live<'e, E>(
    executor: E,
    token_hash: &TokenHash,
) -> Result<Option<Session>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query_as!(
        Session,
        r#"SELECT id, account_id, created_at, expires_at
           FROM sessions
           WHERE token_hash = $1 AND expires_at > now()"#,
        token_hash.as_ref(),
    )
    .fetch_optional(executor)
    .await
}

/// Deletes the session a token names. `Ok(false)` when there was none, which
/// a logout treats the same as success.
pub(super) async fn delete<'e, E>(executor: E, token_hash: &TokenHash) -> Result<bool, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let result = sqlx::query!(
        "DELETE FROM sessions WHERE token_hash = $1",
        token_hash.as_ref(),
    )
    .execute(executor)
    .await?;

    Ok(result.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::sessions::SessionToken;
    use crate::testing::display_name;
    use sqlx::PgPool;

    async fn account(pool: &PgPool) -> Uuid {
        AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap()
            .id
    }

    /// Moves a session's expiry into the past. Unchecked query: see
    /// docs/TESTS.md.
    async fn expire(pool: &PgPool, id: Uuid) {
        sqlx::query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM sessions")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn insert_and_find_round_trip(pool: PgPool) {
        let account_id = account(&pool).await;
        let hash = SessionToken::generate().unwrap().hash();

        let inserted = insert(&pool, account_id, &hash).await.unwrap();
        let found = find_live(&pool, &hash).await.unwrap();

        assert_eq!(found, Some(inserted.clone()));
        assert_eq!(inserted.account_id, account_id);
        assert!(inserted.expires_at > inserted.created_at);
    }

    #[sqlx::test]
    async fn find_is_none_for_an_unknown_hash(pool: PgPool) {
        let found = find_live(&pool, &SessionToken::generate().unwrap().hash())
            .await
            .unwrap();

        assert_eq!(found, None);
    }

    #[sqlx::test]
    async fn an_expired_session_is_not_found_and_not_removed(pool: PgPool) {
        let account_id = account(&pool).await;
        let hash = SessionToken::generate().unwrap().hash();
        let session = insert(&pool, account_id, &hash).await.unwrap();
        expire(&pool, session.id).await;

        let found = find_live(&pool, &hash).await.unwrap();

        assert_eq!(found, None);
        assert_eq!(count(&pool).await, 1, "cleanup is not this query's job");
    }

    /// The row must give up when the cookie does: both are derived from
    /// `SESSION_LIFETIME`.
    #[sqlx::test]
    async fn a_session_lives_for_the_lifetime(pool: PgPool) {
        let account_id = account(&pool).await;
        let session = insert(&pool, account_id, &SessionToken::generate().unwrap().hash())
            .await
            .unwrap();

        // In seconds: a timestamp difference of 30 days comes back as an
        // interval of days, not microseconds. Unchecked query: see
        // docs/TESTS.md.
        let lifetime_secs: f64 = sqlx::query_scalar(
            "SELECT extract(epoch FROM expires_at - created_at)::float8 FROM sessions WHERE id = $1",
        )
        .bind(session.id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(lifetime_secs, SESSION_LIFETIME.as_secs_f64());
    }

    #[sqlx::test]
    async fn delete_removes_the_session_once(pool: PgPool) {
        let account_id = account(&pool).await;
        let hash = SessionToken::generate().unwrap().hash();
        insert(&pool, account_id, &hash).await.unwrap();

        assert!(delete(&pool, &hash).await.unwrap());
        assert!(!delete(&pool, &hash).await.unwrap());
        assert_eq!(find_live(&pool, &hash).await.unwrap(), None);
    }

    /// The same token can never name two sessions; the constraint is what
    /// makes the hash lookup unambiguous.
    #[sqlx::test]
    async fn a_hash_is_unique(pool: PgPool) {
        let account_id = account(&pool).await;
        let hash = SessionToken::generate().unwrap().hash();
        insert(&pool, account_id, &hash).await.unwrap();

        let error = insert(&pool, account_id, &hash).await.unwrap_err();

        assert!(matches!(error, sqlx::Error::Database(db) if db.is_unique_violation()));
    }

    #[sqlx::test]
    async fn deleting_an_account_deletes_its_sessions(pool: PgPool) {
        let account_id = account(&pool).await;
        insert(&pool, account_id, &SessionToken::generate().unwrap().hash())
            .await
            .unwrap();

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(account_id)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(count(&pool).await, 0);
    }
}
