//! `/health`, in the terms of whichever handle the deployment has.
//!
//! Natively the probe runs on the process's [`PgPool`] and answers for the
//! process, not for a request ([`router`], ADR 0021 (e)). On a Worker there is
//! no process to answer for and no pool: the probe runs on the request's own
//! connection through [`db_router`]. Both answer the same two plain-text
//! answers under the same [`DB_TIMEOUT`] and share one description, so the
//! OpenAPI document does not depend on which is mounted (ADR 0022 (f)).

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
#[cfg(not(target_arch = "wasm32"))]
use sqlx::PgPool;
use std::future::Future;
use std::time::Duration;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::db::Db;
use crate::deadline::with_deadline;
use crate::http::response::Documented;

/// How long `/health` waits for the DB before reporting it unavailable.
///
/// The one database budget on the Worker path too: the per-request connect,
/// this probe and the close each run under it. It is what the native path
/// already gives both the pool's acquire and this probe, and per-phase budgets
/// would be numbers with no evidence behind them (ADR 0022 (d)).
pub const DB_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(not(target_arch = "wasm32"))]
pub fn router(pool: PgPool) -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(health_check))
        .with_state(pool)
}

/// `/health` on the request's own connection: what the Worker mounts, and
/// what the native assembly tests mount so this handler is exercised by
/// `cargo test` rather than only compiled.
pub fn db_router(db: Db) -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(health_check_on_db))
        .with_state(db)
}

/// What `/health` answers, for the description: never built, the handler
/// answers with plain text.
#[derive(utoipa::IntoResponses)]
#[allow(dead_code)]
enum HealthResponses {
    /// `OK`: the database answered.
    #[response(status = 200, content_type = "text/plain")]
    Healthy(String),
    /// `DB unavailable`: the database did not answer in time.
    #[response(status = 503, content_type = "text/plain")]
    Unavailable(String),
}

/// 200 when the DB answers `SELECT 1` in time, 503 otherwise.
#[cfg(not(target_arch = "wasm32"))]
#[utoipa::path(get, path = "/health")]
async fn health_check(State(pool): State<PgPool>) -> Documented<HealthResponses> {
    let ping = sqlx::query("SELECT 1").execute(&pool);
    let answer: Response = match tokio::time::timeout(DB_TIMEOUT, ping).await {
        Ok(Ok(_)) => (StatusCode::OK, "OK").into_response(),
        Ok(Err(_)) | Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "DB unavailable").into_response(),
    };
    answer.into()
}

/// The same two answers, probing the handle the request's services use.
///
/// The acquire is part of the probe: on a connection-backed handle it is the
/// request's one connection, so a `/health` that cannot take it is as
/// unavailable as one whose query fails. An `unavailable` handle — a Worker
/// whose connect failed — fails at the acquire, which is how `/health`
/// reports a failed connect in its own documented shape.
#[utoipa::path(get, path = "/health")]
async fn health_check_on_db(State(db): State<Db>) -> Documented<HealthResponses> {
    answer(async move {
        let mut conn = db.acquire().await?;
        sqlx::query("SELECT 1").execute(&mut *conn).await?;
        Ok(())
    })
    .await
    .into()
}

/// Applies the deadline to `probe` and maps the three outcomes onto the two
/// answers. Split out so a test can hand it a probe that never finishes and
/// see the promised 503 instead of a hung request.
///
/// On expiry `probe` is dropped, which releases the `DbConn` guard it held;
/// the connection itself stays the router's and is dealt with when the
/// request ends. The query may still complete on the server, which is
/// harmless on a connection about to be closed.
async fn answer(probe: impl Future<Output = Result<(), sqlx::Error>>) -> Response {
    match with_deadline(DB_TIMEOUT, probe).await {
        Ok(Ok(())) => (StatusCode::OK, "OK").into_response(),
        Ok(Err(_)) | Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "DB unavailable").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    /// Set when the value it is held by is dropped.
    struct DropFlag(Arc<AtomicBool>);

    impl Drop for DropFlag {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    async fn plain_text(response: Response) -> (StatusCode, String) {
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, String::from_utf8(bytes.to_vec()).unwrap())
    }

    /// The case the deadline exists for: a database that never answers. The
    /// paused clock makes the two seconds pass instantly, so the promised 503
    /// is pinned deterministically rather than by waiting.
    #[tokio::test(start_paused = true)]
    async fn a_hanging_probe_answers_unavailable_in_time() {
        let dropped = Arc::new(AtomicBool::new(false));
        let flag = DropFlag(Arc::clone(&dropped));
        let never = async move {
            let _flag = flag;
            std::future::pending::<Result<(), sqlx::Error>>().await
        };

        let (status, body) = plain_text(answer(never).await).await;

        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(body, "DB unavailable");
        assert!(
            dropped.load(Ordering::SeqCst),
            "the expired probe must be dropped, releasing its guard"
        );
    }

    #[tokio::test]
    async fn a_probe_that_answers_is_healthy() {
        let (status, body) = plain_text(answer(std::future::ready(Ok(()))).await).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, "OK");
    }

    #[tokio::test]
    async fn a_probe_that_fails_is_unavailable() {
        let failed = std::future::ready(Err(sqlx::Error::PoolClosed));

        let (status, body) = plain_text(answer(failed).await).await;

        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(body, "DB unavailable");
    }
}
