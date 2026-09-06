use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use webauthn_rs::prelude::{CreationChallengeResponse, CredentialID, RegisterPublicKeyCredential};

use cas::accounts::{DisplayName, DisplayNameError};
use cas::registration::{FinishError, RegistrationService, StartError};

use crate::error::ApiError;
use crate::extract::Json as AppJson;

#[derive(Debug, Error, miette::Diagnostic)]
pub enum RegistrationError {
    #[diagnostic(code(cas::invalid_display_name))]
    #[error("Invalid display name: {0}")]
    InvalidDisplayName(#[source] DisplayNameError),

    #[diagnostic(code(cas::registration_start_failed))]
    #[error(transparent)]
    Start(StartError),

    #[diagnostic(code(cas::registration_finish_failed))]
    #[error(transparent)]
    Finish(FinishError),
}

impl From<RegistrationError> for ApiError {
    fn from(err: RegistrationError) -> Self {
        let message = err.to_string();
        match err {
            RegistrationError::InvalidDisplayName(_) => {
                ApiError::bad_request("invalid_display_name", message)
            }
            RegistrationError::Start(StartError::Db(error))
            | RegistrationError::Finish(FinishError::Db(error)) => ApiError::from(error),
            // webauthn-rs refusing to issue a challenge for a valid relying
            // party is nothing this code can name.
            RegistrationError::Start(StartError::Webauthn(error)) => ApiError::internal(error),
            RegistrationError::Finish(FinishError::NotFound) => {
                ApiError::not_found("registration_not_found", message)
            }
            RegistrationError::Finish(FinishError::Verification(_)) => {
                ApiError::bad_request("registration_verification_failed", message)
            }
            RegistrationError::Finish(FinishError::CredentialAlreadyRegistered) => {
                ApiError::conflict("credential_already_registered", message)
            }
        }
    }
}

#[derive(Clone)]
pub struct ApiState {
    pub registration: RegistrationService,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationOptionsRequest {
    /// Validated by the handler rather than by the type, so a bad name gets
    /// its own error code instead of a generic `invalid_body`.
    display_name: String,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationOptionsResponse {
    /// Identifies the ceremony; the client brings it back to finish. Not the
    /// account id, which only a finished registration reveals.
    registration_id: Uuid,
    ccr: CreationChallengeResponse,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRegistrationData {
    registration_id: Uuid,
    response: RegisterPublicKeyCredential,
}

/// What the client needs after a successful registration: who it now is, and
/// which credential was stored. The credential itself is server-side state and
/// is never sent back.
#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRegistrationResponse {
    account_id: Uuid,
    credential_id: CredentialID,
}

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/register-options", post(get_registration_options))
        .route("/verify-registration", post(verify_registration))
        .with_state(state)
}

async fn get_registration_options(
    State(state): State<ApiState>,
    AppJson(request): AppJson<RegistrationOptionsRequest>,
) -> Result<Json<RegistrationOptionsResponse>, ApiError> {
    let display_name = DisplayName::try_new(request.display_name)
        .map_err(RegistrationError::InvalidDisplayName)?;

    let started = state
        .registration
        .start(display_name)
        .await
        .map_err(RegistrationError::Start)?;

    Ok(Json(RegistrationOptionsResponse {
        registration_id: started.registration_id,
        ccr: started.ccr,
    }))
}

async fn verify_registration(
    State(state): State<ApiState>,
    AppJson(data): AppJson<VerifyRegistrationData>,
) -> Result<Json<VerifyRegistrationResponse>, ApiError> {
    let registered = state
        .registration
        .finish(data.registration_id, &data.response)
        .await
        .map_err(RegistrationError::Finish)?;

    Ok(Json(VerifyRegistrationResponse {
        account_id: registered.account.id,
        credential_id: registered.credential.passkey.cred_id().clone(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
        response::IntoResponse,
    };
    use cas::accounts::{AccountRepository, AccountType};
    use cas::passkeys::{DEFAULT_PASSKEY_NAME, PasskeyRepository};
    use cas::testing::{soft_passkey_registration, test_webauthn};
    use sqlx::{PgPool, postgres::PgPoolOptions};
    use tower::ServiceExt;

    fn test_app(pool: PgPool) -> Router {
        router(ApiState {
            registration: RegistrationService::new(test_webauthn(), pool),
        })
    }

    /// For requests that fail before any query: a lazy pool never connects,
    /// so these tests need no database.
    fn test_app_without_db() -> Router {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://unused")
            .expect("a lazy pool needs no database");
        test_app(pool)
    }

    fn json_request(uri: &str, body: serde_json::Value) -> Request<Body> {
        raw_request(uri, "application/json", body.to_string())
    }

    fn raw_request(uri: &str, content_type: &str, body: impl Into<Body>) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header(header::CONTENT_TYPE, content_type)
            .body(body.into())
            .unwrap()
    }

    fn register_options_request(display_name: &str) -> Request<Body> {
        json_request(
            "/register-options",
            serde_json::json!({ "displayName": display_name }),
        )
    }

    /// A syntactically valid but unverifiable credential: enough to reach the
    /// ceremony lookup, never enough to pass verification.
    fn verify_registration_request(registration_id: &str) -> Request<Body> {
        json_request(
            "/verify-registration",
            serde_json::json!({
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
            }),
        )
    }

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    async fn start(app: &Router, display_name: &str) -> RegistrationOptionsResponse {
        let response = app
            .clone()
            .oneshot(register_options_request(display_name))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        serde_json::from_value(body_json(response).await).unwrap()
    }

    #[sqlx::test]
    async fn registration_start_and_finish_creates_an_account_and_a_credential(pool: PgPool) {
        let app = test_app(pool.clone());
        let options = start(&app, "Ada").await;
        let attestation = soft_passkey_registration(options.ccr);

        let response = app
            .oneshot(json_request(
                "/verify-registration",
                serde_json::json!({
                    "registrationId": options.registration_id,
                    "response": attestation,
                }),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_json(response).await;
        let account_id: Uuid = serde_json::from_value(body["accountId"].clone()).unwrap();
        assert_ne!(account_id, options.registration_id);
        assert!(body["credentialId"].is_string());
        // The stored credential stays server-side.
        assert!(body.get("cred").is_none());
        assert!(body.get("credential").is_none());

        let account = AccountRepository::new(pool.clone())
            .get(account_id)
            .await
            .unwrap()
            .expect("registration must create the account");
        assert_eq!(account.display_name, "Ada");
        assert_eq!(account.r#type, AccountType::Full);

        let credentials = PasskeyRepository::new(pool)
            .list_for_account(account_id)
            .await
            .unwrap();
        assert_eq!(credentials.len(), 1);
        assert_eq!(credentials[0].name, DEFAULT_PASSKEY_NAME);
    }

    /// The challenge answers exactly one request; a replayed finish finds no
    /// ceremony left.
    #[sqlx::test]
    async fn finishing_a_registration_twice_returns_404(pool: PgPool) {
        let app = test_app(pool);
        let options = start(&app, "Ada").await;
        let attestation = soft_passkey_registration(options.ccr);
        let finish = || {
            json_request(
                "/verify-registration",
                serde_json::json!({
                    "registrationId": options.registration_id,
                    "response": attestation,
                }),
            )
        };

        let first = app.clone().oneshot(finish()).await.unwrap();
        assert_eq!(first.status(), StatusCode::OK);

        let second = app.oneshot(finish()).await.unwrap();
        assert_eq!(second.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            body_json(second).await["error"]["code"],
            "registration_not_found"
        );
    }

    #[tokio::test]
    async fn register_options_rejects_invalid_display_names() {
        let app = test_app_without_db();

        for display_name in [
            "",
            "   ",
            &"a".repeat(65),
            "Ada\u{7}",
            "\u{200b}",
            "\u{202e}adA",
        ] {
            let response = app
                .clone()
                .oneshot(register_options_request(display_name))
                .await
                .unwrap();

            assert_eq!(
                response.status(),
                StatusCode::BAD_REQUEST,
                "display name {display_name:?} must be rejected"
            );
            assert_eq!(
                body_json(response).await["error"]["code"],
                "invalid_display_name"
            );
        }
    }

    #[sqlx::test]
    async fn register_options_normalises_the_display_name(pool: PgPool) {
        let app = test_app(pool);

        let options = start(&app, "  Ada   Lovelace  ").await;

        assert_eq!(options.ccr.public_key.user.name, "Ada Lovelace");
        assert_eq!(options.ccr.public_key.user.display_name, "Ada Lovelace");
    }

    #[tokio::test]
    async fn register_options_without_a_display_name_returns_422() {
        let response = test_app_without_db()
            .oneshot(json_request("/register-options", serde_json::json!({})))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(body_json(response).await["error"]["code"], "invalid_body");
    }

    #[tokio::test]
    async fn verify_registration_with_invalid_registration_id_returns_422() {
        let response = test_app_without_db()
            .oneshot(verify_registration_request("not-a-uuid"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "invalid_body");
        assert!(body["error"]["message"].is_string());
    }

    #[tokio::test]
    async fn verify_registration_with_malformed_json_body_returns_api_error() {
        let request = raw_request("/verify-registration", "application/json", "{not json");

        let response = test_app_without_db().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "invalid_body");
        assert!(body["error"]["message"].is_string());
    }

    #[tokio::test]
    async fn verify_registration_with_wrong_content_type_returns_api_error() {
        let request = raw_request("/verify-registration", "text/plain", "{}");

        let response = test_app_without_db().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "invalid_body");
        assert!(body["error"]["message"].is_string());
    }

    #[sqlx::test]
    async fn verify_registration_with_unknown_registration_returns_404(pool: PgPool) {
        let response = test_app(pool)
            .oneshot(verify_registration_request(&Uuid::new_v4().to_string()))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "registration_not_found");
    }

    /// A duplicate credential cannot be produced through the API with a real
    /// authenticator (each registration mints a fresh id), so the mapping is
    /// checked on the error itself.
    #[tokio::test]
    async fn an_already_registered_credential_is_a_conflict() {
        let error = RegistrationError::Finish(FinishError::CredentialAlreadyRegistered);

        let response = ApiError::from(error).into_response();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "credential_already_registered"
        );
    }

    /// A database that does not answer is a 503, never a 500: the client may
    /// retry, and the ceremony is still there when it does.
    #[tokio::test]
    async fn a_database_timeout_is_service_unavailable() {
        let error = RegistrationError::Finish(FinishError::Db(sqlx::Error::PoolTimedOut));

        let response = ApiError::from(error).into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "database_unavailable"
        );
    }
}
