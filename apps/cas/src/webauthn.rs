use std::{collections::HashMap, sync::Arc};

use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, Passkey, PasskeyRegistration, RegisterPublicKeyCredential,
};

use crate::error::ApiError;

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

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/register-options", post(get_registration_options))
        .route("/verify-registration", post(verify_registration))
        .with_state(state)
}

async fn get_registration_options(
    State(state): State<ApiState>,
) -> Result<Json<RegistrationOptionsResponse>, ApiError> {
    let user_id = Uuid::new_v4();
    let (ccr, skr) = state
        .webauthn
        .start_passkey_registration(user_id, "testuser", "testuser", None)
        .map_err(ApiError::Internal)?;
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
) -> Result<Json<VerifyRegistrationResponse>, ApiError> {
    let user_id =
        Uuid::parse_str(&data.registration_id).map_err(ApiError::InvalidRegistrationId)?;
    let skr = state
        .registration_state
        .lock()
        .await
        .remove(&UserId(user_id))
        .ok_or(ApiError::RegistrationStateNotFound)?;

    let result = state
        .webauthn
        .finish_passkey_registration(&data.response, &skr)
        .map_err(ApiError::VerifyRegistration)?;

    Ok(Json(VerifyRegistrationResponse(result)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
    };
    use tower::ServiceExt;
    use webauthn_rs::prelude::Url;

    fn test_app() -> Router {
        let state = ApiState {
            registration_state: Arc::new(Mutex::new(HashMap::new())),
            webauthn: webauthn_rs::WebauthnBuilder::new(
                "localhost",
                &"http://localhost:5173".parse::<Url>().unwrap(),
            )
            .unwrap()
            .build()
            .unwrap(),
        };
        router(state)
    }

    fn verify_registration_request(registration_id: &str) -> Request<Body> {
        let body = serde_json::json!({
            "registrationId": registration_id,
            "response": {
                "id": "dGVzdA",
                "rawId": "dGVzdA",
                "response": {
                    "attestationObject": "dGVzdA",
                    "clientDataJSON": "dGVzdA",
                    "transports": []
                },
                "type": "public-key",
                "extensions": {}
            }
        });
        Request::builder()
            .method("POST")
            .uri("/verify-registration")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    async fn error_body(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn verify_registration_with_invalid_registration_id_returns_400() {
        let response = test_app()
            .oneshot(verify_registration_request("not-a-uuid"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = error_body(response).await;
        assert_eq!(body["error"]["code"], "invalid_registration_id");
        assert!(body["error"]["message"].is_string());
    }

    #[tokio::test]
    async fn verify_registration_with_unknown_registration_state_returns_404() {
        let response = test_app()
            .oneshot(verify_registration_request(&Uuid::new_v4().to_string()))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = error_body(response).await;
        assert_eq!(body["error"]["code"], "registration_state_not_found");
    }
}
