use axum::{
    Json,
    extract::rejection::JsonRejection,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

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

/// SQLSTATE classes that say the database, not the statement, is the problem:
/// `08` connection exception, `53` insufficient resources, `57` operator
/// intervention (`57P01`, the FATAL a restart or a failover sends on an
/// established connection), `58` system error. All of them arrive as
/// [`sqlx::Error::Database`], which is why the pool variants alone are not
/// enough to recognise an outage.
const UNAVAILABLE_CLASSES: [&str; 4] = ["08", "53", "57", "58"];

/// Serialization failure and deadlock: the database is up and the statement is
/// fine, this transaction simply lost. Retrying it is the documented fix, so it
/// gets its own code rather than the generic unavailability one.
const SERIALIZATION_FAILURE: &str = "40001";
const DEADLOCK_DETECTED: &str = "40P01";

/// Why a database error is the client's to retry rather than an incident.
enum Retryable {
    /// The database is not reachable or not accepting work.
    Unavailable,
    /// The database rejected this transaction under contention.
    Busy,
}

/// Classifies a database failure. `None` means the code has no name for it —
/// a constraint the caller did not expect, a row that will not decode, a query
/// the schema no longer matches — and it takes the 500 fallback.
fn retryable(error: &sqlx::Error) -> Option<Retryable> {
    match error {
        sqlx::Error::PoolTimedOut
        | sqlx::Error::PoolClosed
        | sqlx::Error::Io(_)
        | sqlx::Error::Tls(_)
        // A broken or unexpected protocol exchange, and a BEGIN that did not
        // take: both mean the connection, not the query, went wrong.
        | sqlx::Error::Protocol(_)
        | sqlx::Error::BeginFailed => Some(Retryable::Unavailable),
        sqlx::Error::Database(db) => match db.code().as_deref() {
            Some(SERIALIZATION_FAILURE | DEADLOCK_DETECTED) => Some(Retryable::Busy),
            Some(code) if UNAVAILABLE_CLASSES.iter().any(|class| code.starts_with(class)) => {
                Some(Retryable::Unavailable)
            }
            _ => None,
        },
        _ => None,
    }
}

/// The one place a database error becomes a response. A database that does not
/// answer, has stopped accepting work, or aborted the transaction under
/// contention is a known condition (503, retryable); anything else — a
/// constraint violation nobody expected, a query the schema no longer matches,
/// a row that will not decode — is a bug and takes the 500 fallback.
impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        match retryable(&error) {
            Some(Retryable::Unavailable) => Self::service_unavailable(
                "database_unavailable",
                "The database is not available, try again later",
                error,
            ),
            Some(Retryable::Busy) => Self::service_unavailable(
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
    use sqlx::error::{DatabaseError, ErrorKind};
    use std::borrow::Cow;

    /// A database error carrying a chosen SQLSTATE. The driver only builds
    /// these from a real server message, and the failures worth testing here —
    /// a shutdown, a deadlock — cannot be provoked from a unit test.
    #[derive(Debug)]
    struct FakeDbError {
        code: String,
    }

    impl std::fmt::Display for FakeDbError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "fake database error {}", self.code)
        }
    }

    impl std::error::Error for FakeDbError {}

    impl DatabaseError for FakeDbError {
        fn message(&self) -> &str {
            "fake database error"
        }

        fn code(&self) -> Option<Cow<'_, str>> {
            Some(Cow::Borrowed(&self.code))
        }

        fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
            self
        }

        fn kind(&self) -> ErrorKind {
            match self.code.as_str() {
                "23505" => ErrorKind::UniqueViolation,
                _ => ErrorKind::Other,
            }
        }
    }

    fn db_error(code: &str) -> sqlx::Error {
        sqlx::Error::Database(Box::new(FakeDbError {
            code: code.to_owned(),
        }))
    }

    fn mapped(error: sqlx::Error) -> (StatusCode, &'static str) {
        let api = ApiError::from(error);
        (api.status, api.code)
    }

    #[test]
    fn a_pool_timeout_is_service_unavailable() {
        assert_eq!(
            mapped(sqlx::Error::PoolTimedOut),
            (StatusCode::SERVICE_UNAVAILABLE, "database_unavailable")
        );
    }

    /// 57P01: the FATAL Postgres sends when an admin, a restart or a failover
    /// terminates the connection. It arrives on an established connection, so
    /// no pool variant sees it.
    #[test]
    fn a_terminated_connection_is_service_unavailable() {
        assert_eq!(
            mapped(db_error("57P01")),
            (StatusCode::SERVICE_UNAVAILABLE, "database_unavailable")
        );
    }

    #[test]
    fn a_connection_exception_is_service_unavailable() {
        assert_eq!(
            mapped(db_error("08006")),
            (StatusCode::SERVICE_UNAVAILABLE, "database_unavailable")
        );
    }

    #[test]
    fn a_deadlock_is_a_busy_database() {
        assert_eq!(
            mapped(db_error("40P01")),
            (StatusCode::SERVICE_UNAVAILABLE, "database_busy")
        );
    }

    #[test]
    fn a_serialization_failure_is_a_busy_database() {
        assert_eq!(
            mapped(db_error("40001")),
            (StatusCode::SERVICE_UNAVAILABLE, "database_busy")
        );
    }

    /// A constraint violation that reached this impl is a caller that forgot to
    /// handle it: a bug, not a retryable outage.
    #[test]
    fn a_unique_violation_stays_internal() {
        assert_eq!(
            mapped(db_error("23505")),
            (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
        );
    }

    #[test]
    fn a_decode_error_stays_internal() {
        assert_eq!(
            mapped(sqlx::Error::Decode("not a uuid".into())),
            (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
        );
    }
}
