use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error, miette::Diagnostic)]
pub enum ApiError {
    #[diagnostic(code(cas::invalid_registration_id))]
    #[error("Invalid registration id: {0}")]
    InvalidRegistrationId(#[source] uuid::Error),

    #[diagnostic(code(cas::registration_state_not_found))]
    #[error("Registration state not found")]
    RegistrationStateNotFound,

    #[diagnostic(code(cas::registration_verification_failed))]
    #[error("Failed to verify registration: {0}")]
    VerifyRegistration(#[source] webauthn_rs::prelude::WebauthnError),

    #[diagnostic(code(cas::internal_error))]
    #[error("Internal server error")]
    Internal(#[source] webauthn_rs::prelude::WebauthnError),
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            ApiError::InvalidRegistrationId(_) => StatusCode::BAD_REQUEST,
            ApiError::RegistrationStateNotFound => StatusCode::NOT_FOUND,
            ApiError::VerifyRegistration(_) => StatusCode::BAD_REQUEST,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            ApiError::InvalidRegistrationId(_) => "invalid_registration_id",
            ApiError::RegistrationStateNotFound => "registration_state_not_found",
            ApiError::VerifyRegistration(_) => "registration_verification_failed",
            ApiError::Internal(_) => "internal_error",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        if status.is_server_error() {
            tracing::error!(error = ?self, "internal error");
        }
        let body = json!({
            "error": {
                "code": self.code(),
                "message": self.to_string(),
            }
        });
        (status, Json(body)).into_response()
    }
}
