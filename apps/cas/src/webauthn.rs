use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, CredentialID, RegisterPublicKeyCredential, WebauthnError,
};

use cas::accounts::NewAccount;
use cas::passkeys::{DEFAULT_PASSKEY_NAME, PasskeyRepository};

use crate::ceremony::{CeremonyStore, PendingRegistration};
use crate::error::ApiError;
use crate::extract::Json as AppJson;

/// Upper bound on a display name, in characters. Long enough for a real name,
/// short enough to keep the sign-in UI and the authenticator prompt readable.
const MAX_DISPLAY_NAME_LENGTH: usize = 64;

#[derive(Debug, Error, miette::Diagnostic)]
pub enum RegistrationError {
    #[diagnostic(code(cas::invalid_display_name))]
    #[error("Invalid display name: {0}")]
    InvalidDisplayName(String),

    #[diagnostic(code(cas::invalid_registration_id))]
    #[error("Invalid registration id: {0}")]
    InvalidRegistrationId(#[source] uuid::Error),

    #[diagnostic(code(cas::registration_state_not_found))]
    #[error("Registration state not found: expired or unknown")]
    StateNotFound,

    #[diagnostic(code(cas::registration_verification_failed))]
    #[error("Failed to verify registration: {0}")]
    Verify(#[source] WebauthnError),

    #[diagnostic(code(cas::registration_start_failed))]
    #[error("Failed to start registration: {0}")]
    Start(#[source] WebauthnError),

    #[diagnostic(code(cas::registration_storage_failed))]
    #[error("Failed to store the registration: {0}")]
    Storage(#[source] sqlx::Error),
}

impl From<RegistrationError> for ApiError {
    fn from(err: RegistrationError) -> Self {
        match &err {
            RegistrationError::InvalidDisplayName(_) => {
                ApiError::bad_request("invalid_display_name", err.to_string())
            }
            RegistrationError::InvalidRegistrationId(_) => {
                ApiError::bad_request("invalid_registration_id", err.to_string())
            }
            RegistrationError::StateNotFound => {
                ApiError::not_found("registration_state_not_found", err.to_string())
            }
            RegistrationError::Verify(_) => {
                ApiError::bad_request("registration_verification_failed", err.to_string())
            }
            RegistrationError::Start(_) | RegistrationError::Storage(_) => ApiError::internal(err),
        }
    }
}

#[derive(Clone)]
pub struct ApiState {
    pub webauthn: webauthn_rs::Webauthn,
    pub registrations: CeremonyStore<PendingRegistration>,
    pub passkeys: PasskeyRepository,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationOptionsRequest {
    display_name: String,
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

/// Rejects display names that would be useless as a label or would smuggle
/// control characters into the authenticator prompt and every UI showing them.
fn validate_display_name(value: &str) -> Result<String, RegistrationError> {
    let value = value.trim();

    if value.is_empty() {
        return Err(RegistrationError::InvalidDisplayName(
            "must not be empty".to_owned(),
        ));
    }
    if value.chars().count() > MAX_DISPLAY_NAME_LENGTH {
        return Err(RegistrationError::InvalidDisplayName(format!(
            "must be at most {MAX_DISPLAY_NAME_LENGTH} characters"
        )));
    }
    if value.chars().any(char::is_control) {
        return Err(RegistrationError::InvalidDisplayName(
            "must not contain control characters".to_owned(),
        ));
    }

    Ok(value.to_owned())
}

async fn get_registration_options(
    State(state): State<ApiState>,
    AppJson(request): AppJson<RegistrationOptionsRequest>,
) -> Result<Json<RegistrationOptionsResponse>, ApiError> {
    let display_name = validate_display_name(&request.display_name)?;

    // The account id is minted here, before the account exists: it goes to the
    // authenticator as the WebAuthn user handle, gets baked into the credential
    // and can never change afterwards. The account row itself is written when
    // the ceremony finishes, so an abandoned registration leaves nothing behind.
    let account_id = Uuid::new_v4();

    // v1 has no username (docs/PLAN.md), so the display name serves as both the
    // WebAuthn user name and its display name.
    let (ccr, state_handle) = state
        .webauthn
        .start_passkey_registration(account_id, &display_name, &display_name, None)
        .map_err(RegistrationError::Start)?;

    state
        .registrations
        .insert(
            account_id,
            PendingRegistration {
                account_id,
                display_name,
                state: state_handle,
            },
        )
        .await;

    Ok(Json(RegistrationOptionsResponse {
        registration_id: account_id.to_string(),
        ccr,
    }))
}

async fn verify_registration(
    State(state): State<ApiState>,
    AppJson(data): AppJson<VerifyRegistrationData>,
) -> Result<Json<VerifyRegistrationResponse>, ApiError> {
    let registration_id =
        Uuid::parse_str(&data.registration_id).map_err(RegistrationError::InvalidRegistrationId)?;

    // Single use: taking the state out also prevents replaying a finish.
    let pending = state
        .registrations
        .take(registration_id)
        .await
        .ok_or(RegistrationError::StateNotFound)?;

    let passkey = state
        .webauthn
        .finish_passkey_registration(&data.response, &pending.state)
        .map_err(RegistrationError::Verify)?;

    let (account, credential) = state
        .passkeys
        .create_with_account(
            NewAccount::full(pending.display_name).with_id(pending.account_id),
            &passkey,
            DEFAULT_PASSKEY_NAME,
        )
        .await
        .map_err(RegistrationError::Storage)?;

    Ok(Json(VerifyRegistrationResponse {
        account_id: account.id,
        credential_id: credential.passkey.cred_id().clone(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
    };
    use cas::accounts::{AccountRepository, AccountType};
    use sqlx::PgPool;
    use tower::ServiceExt;
    use webauthn_authenticator_rs::{WebauthnAuthenticator, softpasskey::SoftPasskey};
    use webauthn_rs::prelude::Url;

    const ORIGIN: &str = "http://localhost:5173";

    fn test_app(pool: PgPool) -> Router {
        let state = ApiState {
            webauthn: webauthn_rs::WebauthnBuilder::new(
                "localhost",
                &ORIGIN.parse::<Url>().unwrap(),
            )
            .unwrap()
            .build()
            .unwrap(),
            registrations: CeremonyStore::new(),
            passkeys: PasskeyRepository::new(pool),
        };
        router(state)
    }

    fn json_request(uri: &str, body: serde_json::Value) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    fn register_options_request(display_name: &str) -> Request<Body> {
        json_request(
            "/register-options",
            serde_json::json!({ "displayName": display_name }),
        )
    }

    /// A syntactically valid but unverifiable credential: enough to reach the
    /// state lookup, never enough to pass verification.
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

    #[sqlx::test]
    async fn registration_start_and_finish_creates_an_account_and_a_credential(pool: PgPool) {
        let app = test_app(pool.clone());

        let response = app
            .clone()
            .oneshot(register_options_request("Ada"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let options: RegistrationOptionsResponse =
            serde_json::from_value(body_json(response).await).unwrap();

        // `falsify_uv = true`: registration requires user verification, which a
        // software authenticator can only claim.
        let attestation = WebauthnAuthenticator::new(SoftPasskey::new(true))
            .do_registration(ORIGIN.parse::<Url>().unwrap(), options.ccr)
            .unwrap();

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
        assert_eq!(body["accountId"], options.registration_id);
        assert!(body["credentialId"].is_string());
        // The stored credential stays server-side.
        assert!(body.get("cred").is_none());
        assert!(body.get("credential").is_none());

        let account_id: Uuid = options.registration_id.parse().unwrap();
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
    /// state left.
    #[sqlx::test]
    async fn finishing_a_registration_twice_returns_404(pool: PgPool) {
        let app = test_app(pool);

        let response = app
            .clone()
            .oneshot(register_options_request("Ada"))
            .await
            .unwrap();
        let options: RegistrationOptionsResponse =
            serde_json::from_value(body_json(response).await).unwrap();

        let attestation = WebauthnAuthenticator::new(SoftPasskey::new(true))
            .do_registration(ORIGIN.parse::<Url>().unwrap(), options.ccr)
            .unwrap();
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
            "registration_state_not_found"
        );
    }

    #[sqlx::test]
    async fn register_options_rejects_invalid_display_names(pool: PgPool) {
        let app = test_app(pool);

        for display_name in ["", "   ", &"a".repeat(65), "Ada\u{7}"] {
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
    async fn register_options_trims_the_display_name(pool: PgPool) {
        let app = test_app(pool.clone());

        let response = app
            .clone()
            .oneshot(register_options_request("  Ada  "))
            .await
            .unwrap();
        let options: RegistrationOptionsResponse =
            serde_json::from_value(body_json(response).await).unwrap();

        assert_eq!(options.ccr.public_key.user.name, "Ada");
    }

    #[sqlx::test]
    async fn register_options_without_a_display_name_returns_400(pool: PgPool) {
        let response = test_app(pool)
            .oneshot(json_request("/register-options", serde_json::json!({})))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(body_json(response).await["error"]["code"], "invalid_body");
    }

    #[sqlx::test]
    async fn verify_registration_with_invalid_registration_id_returns_400(pool: PgPool) {
        let response = test_app(pool)
            .oneshot(verify_registration_request("not-a-uuid"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "invalid_registration_id");
        assert!(body["error"]["message"].is_string());
    }

    #[sqlx::test]
    async fn verify_registration_with_malformed_json_body_returns_api_error(pool: PgPool) {
        let request = Request::builder()
            .method("POST")
            .uri("/verify-registration")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from("{not json"))
            .unwrap();

        let response = test_app(pool).oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "invalid_body");
        assert!(body["error"]["message"].is_string());
    }

    #[sqlx::test]
    async fn verify_registration_with_wrong_content_type_returns_api_error(pool: PgPool) {
        let request = Request::builder()
            .method("POST")
            .uri("/verify-registration")
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from("{}"))
            .unwrap();

        let response = test_app(pool).oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "invalid_body");
        assert!(body["error"]["message"].is_string());
    }

    #[sqlx::test]
    async fn verify_registration_with_unknown_registration_state_returns_404(pool: PgPool) {
        let response = test_app(pool)
            .oneshot(verify_registration_request(&Uuid::new_v4().to_string()))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "registration_state_not_found");
    }
}
