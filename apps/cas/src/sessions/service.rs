//! Issuing, resolving and revoking sessions.
//!
//! `create` is what registration and login call once an account is proven;
//! `authenticate` is what the cookie extractor calls on every authenticated
//! request, and it is also where a session's idle clock is reset; `revoke` is
//! logout. The secret token exists in memory only between `create` and the
//! response that sets the cookie.

use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::{Authenticated, Renewal, Session, SessionToken, repository};
use crate::accounts;

#[derive(Debug, Error)]
pub enum CreateError {
    /// The operating system refused to provide randomness. Nothing a request
    /// can do about it.
    #[error("failed to generate a session token: {0}")]
    Random(#[source] getrandom::Error),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// A session just created, with the token the browser must be given. The
/// token is returned exactly once: the row keeps only its hash.
#[derive(Debug)]
pub struct IssuedSession {
    pub token: SessionToken,
    pub session: Session,
}

#[derive(Debug, Clone)]
pub struct SessionService {
    pool: PgPool,
}

impl SessionService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Issues a session for an account that has just proven who it is.
    ///
    /// Signing in is activity: the account's `last_seen_at` moves in the same
    /// transaction, so a session and the trace it leaves on the account are
    /// written together or not at all.
    pub async fn create(&self, account_id: Uuid) -> Result<IssuedSession, CreateError> {
        let token = SessionToken::generate().map_err(CreateError::Random)?;

        let mut tx = self.pool.begin().await?;
        let session = repository::insert(&mut *tx, account_id, &token.hash()).await?;
        accounts::touch_last_seen(&mut *tx, account_id).await?;
        tx.commit().await?;

        Ok(IssuedSession { token, session })
    }

    /// Resolves a token to the session and account it names. `Ok(None)` for a
    /// token that is unknown, idle for too long, past its cap or revoked, or
    /// whose account is gone.
    ///
    /// A live session whose last reset is a renewal window or more in the past
    /// is renewed here: its idle clock and the account's `last_seen_at` move
    /// together, in one transaction, as at creation. Inside the window nothing
    /// is written, so a busy session costs one write per window, not one per
    /// request. The caller learns which it was and re-sends the cookie on
    /// [`Renewal::Renewed`].
    pub async fn authenticate(
        &self,
        token: &SessionToken,
    ) -> Result<Option<(Authenticated, Renewal)>, sqlx::Error> {
        let Some(live) = repository::find_live(&self.pool, &token.hash()).await? else {
            return Ok(None);
        };
        let mut session = live.session;

        let renewal = if live.renewal_due {
            let mut tx = self.pool.begin().await?;
            session.last_seen_at = repository::renew(&mut *tx, session.id).await?;
            accounts::touch_last_seen(&mut *tx, session.account_id).await?;
            tx.commit().await?;
            Renewal::Renewed
        } else {
            Renewal::Kept
        };

        // The cascade removes sessions with their account, so a missing
        // account here is a race with that delete, and the answer is the same
        // as if the session had already gone.
        let Some(account) = accounts::get(&self.pool, session.account_id).await? else {
            return Ok(None);
        };

        Ok(Some((Authenticated { session, account }, renewal)))
    }

    /// Ends the session a token names. `Ok(false)` when there was none:
    /// logging out of nothing is not an error.
    pub async fn revoke(&self, token: &SessionToken) -> Result<bool, sqlx::Error> {
        repository::delete(&self.pool, &token.hash()).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::{Account, AccountRepository, NewAccount};
    use crate::testing::display_name;

    async fn account(pool: &PgPool) -> Account {
        AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn a_created_session_authenticates_its_account(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool);

        let issued = service.create(account.id).await.unwrap();
        let (authenticated, renewal) = service
            .authenticate(&issued.token)
            .await
            .unwrap()
            .expect("the session was just created");

        assert_eq!(authenticated.session, issued.session);
        assert_eq!(authenticated.account.id, account.id);
        assert_eq!(authenticated.account.display_name, account.display_name);
        assert_eq!(renewal, Renewal::Kept, "just created: inside the window");
    }

    /// Moves a session's last use into the past by the given interval.
    /// Unchecked query: see docs/TESTS.md.
    async fn last_seen(pool: &PgPool, id: Uuid, ago: &str) {
        sqlx::query("UPDATE sessions SET last_seen_at = now() - $2::interval WHERE id = $1")
            .bind(id)
            .bind(ago)
            .execute(pool)
            .await
            .unwrap();
    }

    /// Two requests inside the renewal window leave the row exactly as it
    /// was: the idle clock is not a per-request write.
    #[sqlx::test]
    async fn requests_inside_the_window_do_not_write(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool);
        let issued = service.create(account.id).await.unwrap();

        for _ in 0..2 {
            let (authenticated, renewal) =
                service.authenticate(&issued.token).await.unwrap().unwrap();

            assert_eq!(renewal, Renewal::Kept);
            assert_eq!(
                authenticated.session.last_seen_at,
                issued.session.last_seen_at
            );
        }
    }

    /// A request outside the window resets the idle clock, leaves the cap,
    /// and marks the account as seen; the next request is inside the new
    /// window again.
    #[sqlx::test]
    async fn a_request_outside_the_window_renews_the_session(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        let issued = service.create(account.id).await.unwrap();
        last_seen(&pool, issued.session.id, "2 hours").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE accounts SET last_seen_at = now() - interval '2 hours' WHERE id = $1")
            .bind(account.id)
            .execute(&pool)
            .await
            .unwrap();

        let (renewed, renewal) = service.authenticate(&issued.token).await.unwrap().unwrap();

        assert_eq!(renewal, Renewal::Renewed);
        assert!(renewed.session.last_seen_at >= issued.session.last_seen_at);
        assert_eq!(renewed.session.expires_at, issued.session.expires_at);
        assert!(renewed.account.last_seen_at >= renewed.session.last_seen_at);

        let (again, renewal) = service.authenticate(&issued.token).await.unwrap().unwrap();
        assert_eq!(renewal, Renewal::Kept);
        assert_eq!(again.session, renewed.session);
    }

    /// Idle for longer than the timeout: over, however far the cap is.
    #[sqlx::test]
    async fn an_idle_session_does_not_authenticate(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        let issued = service.create(account.id).await.unwrap();
        last_seen(&pool, issued.session.id, "8 days").await;

        assert_eq!(service.authenticate(&issued.token).await.unwrap(), None);
    }

    #[sqlx::test]
    async fn creating_a_session_marks_the_account_as_seen(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        // Push the timestamp into the past so the update is observable within
        // one test. Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE accounts SET last_seen_at = now() - interval '1 day' WHERE id = $1")
            .bind(account.id)
            .execute(&pool)
            .await
            .unwrap();

        let issued = service.create(account.id).await.unwrap();

        let seen = AccountRepository::new(pool)
            .get(account.id)
            .await
            .unwrap()
            .unwrap();
        assert!(seen.last_seen_at >= issued.session.created_at);
    }

    #[sqlx::test]
    async fn an_unknown_token_does_not_authenticate(pool: PgPool) {
        let service = SessionService::new(pool);

        let authenticated = service
            .authenticate(&SessionToken::generate().unwrap())
            .await
            .unwrap();

        assert_eq!(authenticated, None);
    }

    #[sqlx::test]
    async fn a_revoked_session_does_not_authenticate(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool);
        let issued = service.create(account.id).await.unwrap();

        assert!(service.revoke(&issued.token).await.unwrap());

        assert_eq!(service.authenticate(&issued.token).await.unwrap(), None);
        assert!(
            !service.revoke(&issued.token).await.unwrap(),
            "revoking twice finds nothing"
        );
    }

    #[sqlx::test]
    async fn an_expired_session_does_not_authenticate(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        let issued = service.create(account.id).await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = $1")
            .bind(issued.session.id)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(service.authenticate(&issued.token).await.unwrap(), None);
    }

    /// A session for an account that does not exist cannot be written: the
    /// foreign key holds, and the failed transaction leaves nothing behind.
    #[sqlx::test]
    async fn a_session_needs_an_account(pool: PgPool) {
        let service = SessionService::new(pool.clone());

        let error = service.create(Uuid::new_v4()).await.unwrap_err();

        assert!(matches!(error, CreateError::Db(_)));
        // Unchecked query: see docs/TESTS.md.
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}
