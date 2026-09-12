use axum::{
    Json,
    extract::rejection::JsonRejection,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

use crate::db::Failure;

/// Transport-level HTTP error contract.
///
/// Domain modules keep their own error enums and map them into this type
/// via `From` impls, so the wire format stays in one place.
///
/// Every failure the code can name gets a specific status and a stable code.
/// A 500 is reserved for what nobody anticipated — a panic, an error no
/// branch knows — and is treated as an incident, so no handler maps a known
/// condition to [`ApiError::internal`] on purpose.
#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    /// Stable machine-readable error code exposed to clients.
    code: &'static str,
    /// Client-facing message.
    message: String,
    /// Underlying error, logged for 5xx responses and never sent to clients.
    source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

impl ApiError {
    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::client(StatusCode::BAD_REQUEST, code, message)
    }

    pub fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self::client(StatusCode::UNAUTHORIZED, code, message)
    }

    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::client(StatusCode::NOT_FOUND, code, message)
    }

    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::client(StatusCode::CONFLICT, code, message)
    }

    fn client(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            source: None,
        }
    }

    /// A dependency the request needs is not answering. The client may retry.
    pub fn service_unavailable(
        code: &'static str,
        message: impl Into<String>,
        source: impl Into<Box<dyn std::error::Error + Send + Sync>>,
    ) -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            code,
            message: message.into(),
            source: Some(source.into()),
        }
    }

    /// The fallback for failures the code cannot name. Not for known
    /// conditions: give those their own status and code.
    pub fn internal(source: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "internal_error",
            message: "Internal server error".to_owned(),
            source: Some(source.into()),
        }
    }
}

/// Renders `Json` extractor rejections (malformed body, wrong content-type)
/// in the standard error shape, keeping the rejection's status and message.
impl From<JsonRejection> for ApiError {
    fn from(rejection: JsonRejection) -> Self {
        Self {
            status: rejection.status(),
            code: "invalid_body",
            message: rejection.body_text(),
            source: None,
        }
    }
}

/// The one place a database error becomes a response: it maps the verdict of
/// [`crate::db::classify`] onto a status. A failure the classifier can name is
/// a known, retryable condition (503); anything it cannot name is a bug and
/// takes the 500 fallback.
impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        match crate::db::classify(&error) {
            Some(Failure::Unavailable) => Self::service_unavailable(
                "database_unavailable",
                "The database is not available, try again later",
                error,
            ),
            Some(Failure::Busy) => Self::service_unavailable(
                "database_busy",
                "The database was busy, try again",
                error,
            ),
            None => Self::internal(error),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if self.status.is_server_error() {
            tracing::error!(status = %self.status, code = self.code, source = ?self.source, "server error");
        }
        let body = json!({
            "error": {
                "code": self.code,
                "message": self.message,
            }
        });
        (self.status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::db_error;

    fn mapped(error: sqlx::Error) -> (StatusCode, &'static str) {
        let api = ApiError::from(error);
        (api.status, api.code)
    }

    #[test]
    fn an_unavailable_database_is_service_unavailable() {
        assert_eq!(
            mapped(sqlx::Error::PoolTimedOut),
            (StatusCode::SERVICE_UNAVAILABLE, "database_unavailable")
        );
    }

    #[test]
    fn a_busy_database_is_service_unavailable() {
        assert_eq!(
            mapped(db_error("40P01")),
            (StatusCode::SERVICE_UNAVAILABLE, "database_busy")
        );
    }

    /// A failure the classifier has no name for — here a constraint violation
    /// the caller forgot to handle — takes the 500 fallback.
    #[test]
    fn an_unclassified_failure_stays_internal() {
        assert_eq!(
            mapped(db_error("23505")),
            (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
        );
    }
}
