use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

/// Transport-level HTTP error contract.
///
/// Domain modules keep their own error enums and map them into this type
/// via `From` impls, so the wire format stays in one place.
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
        Self {
            status: StatusCode::BAD_REQUEST,
            code,
            message: message.into(),
            source: None,
        }
    }

    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code,
            message: message.into(),
            source: None,
        }
    }

    pub fn internal(source: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "internal_error",
            message: "Internal server error".to_owned(),
            source: Some(source.into()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if self.status.is_server_error() {
            tracing::error!(code = self.code, source = ?self.source, "internal error");
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
