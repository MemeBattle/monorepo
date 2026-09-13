//! Issuing, resolving and revoking sessions.
//!
//! `create` is what registration and login call once an account is proven;
//! `authenticate` is what the cookie extractor calls on every authenticated
//! request, and it is also where a session's idle clock is reset; `revoke` is
//! logout. The secret token exists in memory only between `create` and the
//! response that sets the cookie.
//!
//! This is also where the session lifecycle is logged, because this is where
//! it happens: a session begins, is renewed and ends in these three
//! functions, and an operator reading the log afterwards wants the same three
//! events. A session is named by its row id, never by the token (ADR 0004).

use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::{Authenticated, Renewal, Session, SessionOrigin, SessionToken, repository};
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
    ///
    /// `origin` says which ceremony proved the account and appears in the log
    /// event, which is emitted only once the transaction has committed: a
    /// session nobody could authenticate with was never created.
    pub async fn create(
        &self,
        account_id: Uuid,
        origin: SessionOrigin,
    ) -> Result<IssuedSession, CreateError> {
        let token = SessionToken::generate().map_err(CreateError::Random)?;

        let mut tx = self.pool.begin().await?;
        let session = repository::insert(&mut *tx, account_id, &token.hash()).await?;
        accounts::touch_last_seen(&mut *tx, account_id).await?;
        tx.commit().await?;

        tracing::info!(
            session_id = %session.id,
            account_id = %account_id,
            origin = origin.as_str(),
            "session created"
        );

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
    ///
    /// The read that says renewal is due and the write that does it are not
    /// one step, so the write checks the window again and may find nothing to
    /// do: another request renewed the session a moment ago, or logout
    /// removed it. Either way this request is treated as one that arrived a
    /// moment later: it reads the session again and authenticates with what
    /// it finds, or is unauthenticated if nothing is there.
    pub async fn authenticate(
        &self,
        token: &SessionToken,
    ) -> Result<Option<(Authenticated, Renewal)>, sqlx::Error> {
        let hash = token.hash();
        let Some(live) = repository::find_live(&self.pool, &hash).await? else {
            return Ok(None);
        };
        let mut session = live.session;

        let mut renewal = Renewal::Kept;
        if live.renewal_due {
            let mut tx = self.pool.begin().await?;
            match repository::renew(&mut *tx, session.id).await? {
                Some(last_seen_at) => {
                    accounts::touch_last_seen(&mut *tx, session.account_id).await?;
                    tx.commit().await?;
                    session.last_seen_at = last_seen_at;
                    renewal = Renewal::Renewed;
                    // Lifecycle too, but at most once per window per
                    // session, which is noise next to creation and logout:
                    // `debug`, so it is there when a session's history is
                    // being reconstructed and absent the rest of the time.
                    tracing::debug!(
                        session_id = %session.id,
                        account_id = %session.account_id,
                        "session renewed"
                    );
                }
                None => {
                    // Nothing was written; dropping the transaction rolls it
                    // back. The session as read is stale by one race.
                    drop(tx);
                    let Some(again) = repository::find_live(&self.pool, &hash).await? else {
                        return Ok(None);
                    };
                    session = again.session;
                }
            }
        }

        // The cascade removes sessions with their account, so a missing
        // account here is a race with that delete, and the answer is the same
        // as if the session had already gone.
        let Some(account) = accounts::get(&self.pool, session.account_id).await? else {
            return Ok(None);
        };

        Ok(Some((Authenticated { session, account }, renewal)))
    }

    /// Ends the session a token names and returns its id. `Ok(None)` when
    /// there was none: logging out of nothing is not an error.
    ///
    /// The delete returns the id it removed, so the event can name the
    /// session without a lookup before it.
    pub async fn revoke(&self, token: &SessionToken) -> Result<Option<Uuid>, sqlx::Error> {
        let revoked = repository::delete(&self.pool, &token.hash()).await?;

        match revoked {
            Some(id) => tracing::info!(session_id = %id, "session revoked"),
            // A cookie whose session had already gone: an expected way for a
            // browser to ask to be forgotten, not something to read a log
            // for.
            None => tracing::debug!("logout without a live session"),
        }

        Ok(revoked)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};

    use crate::accounts::{Account, AccountRepository, NewAccount};
    use crate::testing::{capture_tracing, display_name};

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

        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
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
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();

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
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
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

    /// Two requests arrive at once with the clock due. Each is held at its
    /// renewal write by a row lock taken here, so that both have read the
    /// session as due before either writes; on release, exactly one renews,
    /// the other finds the window already reset and keeps the fresh state.
    #[sqlx::test]
    async fn concurrent_requests_renew_once(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        last_seen(&pool, issued.session.id, "2 hours").await;

        let mut lock = pool.begin().await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("SELECT id FROM sessions WHERE id = $1 FOR UPDATE")
            .bind(issued.session.id)
            .execute(&mut *lock)
            .await
            .unwrap();
        let requests: Vec<_> = (0..2)
            .map(|_| {
                let service = service.clone();
                let token = issued.token.clone();
                tokio::spawn(async move { service.authenticate(&token).await })
            })
            .collect();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        lock.commit().await.unwrap();

        let mut renewed = 0;
        let mut seen = Vec::new();
        for request in requests {
            let (authenticated, renewal) = request.await.unwrap().unwrap().unwrap();
            if renewal == Renewal::Renewed {
                renewed += 1;
            }
            seen.push(authenticated.session.last_seen_at);
        }

        assert_eq!(renewed, 1, "one write for the two of them");
        assert_eq!(seen[0], seen[1], "the loser reads what the winner wrote");
        assert!(seen[0] > issued.session.last_seen_at);
    }

    /// Logout lands between the read that found the session due and the
    /// renewal write: the request is unauthenticated, not an error. The
    /// uncommitted delete holds the row lock the renewal must wait for.
    #[sqlx::test]
    async fn a_session_deleted_during_renewal_does_not_authenticate(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        last_seen(&pool, issued.session.id, "2 hours").await;

        let mut logout = pool.begin().await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(issued.session.id)
            .execute(&mut *logout)
            .await
            .unwrap();
        let request = {
            let service = service.clone();
            let token = issued.token.clone();
            tokio::spawn(async move { service.authenticate(&token).await })
        };
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        logout.commit().await.unwrap();

        assert_eq!(request.await.unwrap().unwrap(), None);
    }

    /// Idle for longer than the timeout: over, however far the cap is.
    #[sqlx::test]
    async fn an_idle_session_does_not_authenticate(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
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

        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();

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
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();

        assert_eq!(
            service.revoke(&issued.token).await.unwrap(),
            Some(issued.session.id)
        );

        assert_eq!(service.authenticate(&issued.token).await.unwrap(), None);
        assert_eq!(
            service.revoke(&issued.token).await.unwrap(),
            None,
            "revoking twice finds nothing"
        );
    }

    /// The whole lifecycle as a log reader sees it: a session created, then
    /// renewed, then revoked, then a logout with nothing left to revoke.
    /// Every event names the row, none of them the secret — not the token and
    /// not the hash the row is found by (ADR 0004).
    #[sqlx::test]
    async fn the_session_lifecycle_is_logged_without_the_token(pool: PgPool) {
        let (events, _guard) = capture_tracing();
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());

        let issued = service
            .create(account.id, SessionOrigin::Registration)
            .await
            .unwrap();
        last_seen(&pool, issued.session.id, "2 hours").await;
        service.authenticate(&issued.token).await.unwrap().unwrap();
        service.revoke(&issued.token).await.unwrap();
        service.revoke(&issued.token).await.unwrap();

        let session_id = format!("session_id={}", issued.session.id);
        let account_id = format!("account_id={}", account.id);

        let [created] = &events.mentioning("session created")[..] else {
            panic!("exactly one creation event: {:?}", events.all());
        };
        assert!(created.starts_with("INFO"), "{created}");
        assert!(created.contains(&session_id), "{created}");
        assert!(created.contains(&account_id), "{created}");
        assert!(created.contains("origin="), "{created}");
        assert!(created.contains("registration"), "{created}");

        let [renewed] = &events.mentioning("session renewed")[..] else {
            panic!("exactly one renewal event: {:?}", events.all());
        };
        assert!(renewed.starts_with("DEBUG"), "{renewed}");
        assert!(renewed.contains(&session_id), "{renewed}");
        assert!(renewed.contains(&account_id), "{renewed}");

        let [revoked] = &events.mentioning("session revoked")[..] else {
            panic!("exactly one revocation event: {:?}", events.all());
        };
        assert!(revoked.starts_with("INFO"), "{revoked}");
        assert!(revoked.contains(&session_id), "{revoked}");

        let [nothing] = &events.mentioning("logout without a live session")[..] else {
            panic!("exactly one empty-logout event: {:?}", events.all());
        };
        assert!(nothing.starts_with("DEBUG"), "{nothing}");

        let hash = URL_SAFE_NO_PAD.encode(issued.token.hash());
        for event in events.all() {
            assert!(
                !event.contains(issued.token.expose()),
                "the token must never be logged: {event}"
            );
            assert!(
                !event.contains(&hash),
                "the token hash must never be logged: {event}"
            );
        }
    }

    #[sqlx::test]
    async fn an_expired_session_does_not_authenticate(pool: PgPool) {
        let account = account(&pool).await;
        let service = SessionService::new(pool.clone());
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
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

        let error = service
            .create(Uuid::new_v4(), SessionOrigin::Login)
            .await
            .unwrap_err();

        assert!(matches!(error, CreateError::Db(_)));
        // Unchecked query: see docs/TESTS.md.
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}
