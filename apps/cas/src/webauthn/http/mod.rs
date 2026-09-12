//! The context's endpoints: `/api/webauthn`, the passkey ceremonies, and
//! `/api/passkeys`, the signed-in account's passkeys. Both mounted by the
//! transport root in `crate::http`; the only part of the context that knows
//! axum.

pub mod login;
pub mod passkeys;
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
        .route("/login-options", post(login::get_login_options))
        .route("/verify-login", post(login::verify_login))
        .with_state(state)
}
