//! `/api/webauthn` — the passkey ceremony endpoints. Mounted by the transport
//! root in `crate::http`; the only part of the context that knows axum.

pub mod registration;

use axum::{Router, routing::post};

use crate::http::ApiState;

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route(
            "/register-options",
            post(registration::get_registration_options),
        )
        .route(
            "/verify-registration",
            post(registration::verify_registration),
        )
        .with_state(state)
}
