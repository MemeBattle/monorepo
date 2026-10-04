use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use sqlx::PgPool;
use std::time::Duration;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::http::response::Documented;

/// How long `/health` waits for the DB before reporting it unavailable.
pub const DB_TIMEOUT: Duration = Duration::from_secs(2);

pub fn router(pool: PgPool) -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(health_check))
        .with_state(pool)
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
#[utoipa::path(get, path = "/health")]
async fn health_check(State(pool): State<PgPool>) -> Documented<HealthResponses> {
    let ping = sqlx::query("SELECT 1").execute(&pool);
    let answer: Response = match tokio::time::timeout(DB_TIMEOUT, ping).await {
        Ok(Ok(_)) => (StatusCode::OK, "OK").into_response(),
        Ok(Err(_)) | Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "DB unavailable").into_response(),
    };
    answer.into()
}
