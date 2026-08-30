use axum::{Router, extract::State, http::StatusCode, routing::get};
use sqlx::PgPool;
use std::time::Duration;

/// How long `/health` waits for the DB before reporting it unavailable.
pub const DB_TIMEOUT: Duration = Duration::from_secs(2);

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .with_state(pool)
}

/// 200 when the DB answers `SELECT 1` in time, 503 otherwise.
async fn health_check(State(pool): State<PgPool>) -> (StatusCode, &'static str) {
    let ping = sqlx::query("SELECT 1").execute(&pool);
    match tokio::time::timeout(DB_TIMEOUT, ping).await {
        Ok(Ok(_)) => (StatusCode::OK, "OK"),
        Ok(Err(_)) | Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "DB unavailable"),
    }
}
