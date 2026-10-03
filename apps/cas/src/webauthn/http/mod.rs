//! The context's endpoints: `/api/webauthn`, the passkey ceremonies for a
//! browser that is nobody yet, and `/api/passkeys`, the signed-in account's
//! passkeys — including the ceremony that adds one. Both mounted by the
//! transport root in `crate::http`; the only part of the context that knows
//! axum.

pub mod addition;
pub mod login;
pub mod passkeys;
pub mod registration;

use utoipa::OpenApi;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::http::ApiState;

/// The response bodies of the ceremonies, for the description.
#[derive(OpenApi)]
#[openapi(components(schemas(
    registration::RegistrationOptionsResponse,
    registration::VerifyRegistrationResponse,
    login::LoginOptionsResponse,
    login::VerifyLoginResponse,
)))]
struct CeremoniesApi;

pub fn router(state: ApiState) -> OpenApiRouter {
    OpenApiRouter::with_openapi(CeremoniesApi::openapi())
        .routes(routes!(registration::get_registration_options))
        .routes(routes!(registration::verify_registration))
        .routes(routes!(login::get_login_options))
        .routes(routes!(login::verify_login))
        .with_state(state)
}
