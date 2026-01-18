use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::Mutex;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, Passkey, PasskeyRegistration, RegisterPublicKeyCredential,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(pub Uuid);

#[derive(Clone)]
pub struct ApiState {
    pub registration_state: Arc<Mutex<HashMap<UserId, PasskeyRegistration>>>,
    pub webauthn: webauthn_rs::Webauthn,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationOptionsResponse {
    registration_id: String,
    ccr: CreationChallengeResponse,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRegistrationData {
    registration_id: String,
    response: RegisterPublicKeyCredential,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRegistrationResponse(pub Passkey);

#[derive(Debug, Error, miette::Diagnostic)]
pub enum RegistrationError {
    #[diagnostic(code(cas::registration_error))]
    #[error("Failed to generate registration options: {0}")]
    GenerateRegistrationOptionsError(webauthn_rs::prelude::WebauthnError),

    #[diagnostic(code(cas::verify_registration_error))]
    #[error("Failed to verify registration: {0}")]
    VerifyRegistrationError(webauthn_rs::prelude::WebauthnError),
}

impl IntoResponse for RegistrationError {
    fn into_response(self) -> Response {
        match self {
            RegistrationError::GenerateRegistrationOptionsError(e) => {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(e.to_string())).into_response()
            }
            RegistrationError::VerifyRegistrationError(e) => {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(e.to_string())).into_response()
            }
        }
    }
}

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/register-options", post(get_registration_options))
        .route("/verify-registration", post(verify_registration))
        .with_state(state)
}

async fn get_registration_options(
    State(state): State<ApiState>,
) -> Result<Json<RegistrationOptionsResponse>, RegistrationError> {
    let user_id = Uuid::new_v4();
    let (ccr, skr) = state
        .webauthn
        .start_passkey_registration(user_id, "testuser", "testuser", None)
        .map_err(RegistrationError::GenerateRegistrationOptionsError)?;
    state
        .registration_state
        .lock()
        .await
        .insert(UserId(user_id), skr);

    Ok(Json(RegistrationOptionsResponse {
        registration_id: user_id.to_string(),
        ccr,
    }))
}

async fn verify_registration(
    State(state): State<ApiState>,
    Json(data): Json<VerifyRegistrationData>,
) -> Result<Json<VerifyRegistrationResponse>, RegistrationError> {
    let user_id = Uuid::parse_str(&data.registration_id).unwrap();
    let skr = state
        .registration_state
        .lock()
        .await
        .remove(&UserId(user_id))
        .expect("Registration state not found");

    let result = state
        .webauthn
        .finish_passkey_registration(&data.response, &skr)
        .map_err(RegistrationError::VerifyRegistrationError)?;

    Ok(Json(VerifyRegistrationResponse(result)))
}
