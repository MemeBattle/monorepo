//! The passkey login endpoints: issuing a challenge any registered credential
//! may answer, and verifying the browser's assertion.

use axum::{Json, extract::State};
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use webauthn_rs::prelude::{CredentialID, PublicKeyCredential, RequestChallengeResponse};

use crate::http::ApiState;
use crate::http::error::ApiError;
use crate::http::extract::Json as AppJson;
use crate::sessions::SessionOrigin;
use crate::webauthn::login::{FinishError, StartError};

impl From<StartError> for ApiError {
    fn from(error: StartError) -> Self {
        match error {
            // webauthn-rs refusing to issue a challenge for a valid relying
            // party is nothing this code can name.
            StartError::Webauthn(error) => ApiError::internal(error),
            StartError::Db(error) => ApiError::from(error),
        }
    }
}

impl From<FinishError> for ApiError {
    fn from(error: FinishError) -> Self {
        match error {
            FinishError::NotFound => ApiError::not_found("login_not_found", error.to_string()),
            // One status and one code for every way an assertion can be
            // refused: the reason is logged by the service, never told to the
            // client, so a probe learns nothing about which credentials exist.
            FinishError::Rejected(_) => ApiError::unauthorized(
                "invalid_credential",
                "The credential is not registered or the assertion could not be verified",
            ),
            FinishError::Db(error) => ApiError::from(error),
        }
    }
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginOptionsResponse {
    /// Identifies the ceremony; the client brings it back to finish.
    login_id: Uuid,
    rcr: RequestChallengeResponse,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyLoginData {
    login_id: Uuid,
    response: PublicKeyCredential,
}

/// Who signed in and with which credential. A session (#667) will accompany
/// this; until then the client learns the account id and nothing else.
#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyLoginResponse {
    account_id: Uuid,
    credential_id: CredentialID,
}

/// Takes no body: the challenge is the same for everyone, and nothing about
/// the user is asked before the authenticator has spoken.
pub(super) async fn get_login_options(
    State(state): State<ApiState>,
) -> Result<Json<LoginOptionsResponse>, ApiError> {
    let started = state.login.start().await?;

    Ok(Json(LoginOptionsResponse {
        login_id: started.login_id,
        rcr: started.rcr,
    }))
}

/// A finished login signs the account in: the response sets the session
/// cookie alongside the body.
pub(super) async fn verify_login(
    State(state): State<ApiState>,
    jar: CookieJar,
    AppJson(data): AppJson<VerifyLoginData>,
) -> Result<(CookieJar, Json<VerifyLoginResponse>), ApiError> {
    let logged_in = state.login.finish(data.login_id, &data.response).await?;
    let issued = state
        .sessions
        .create(logged_in.account.id, SessionOrigin::Login)
        .await?;

    Ok((
        jar.add(state.cookies.session(&issued.token, &issued.session)),
        Json(VerifyLoginResponse {
            account_id: logged_in.account.id,
            credential_id: logged_in.credential.passkey.cred_id().clone(),
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
        response::IntoResponse,
    };
    use sqlx::{PgPool, postgres::PgPoolOptions};
    use tower::ServiceExt;

    use crate::sessions::SessionService;
    use crate::testing::{
        ResidentSoftPasskey, register_soft_passkey, session_cookie, soft_passkey_assertion,
        test_cookies, test_origin, test_state, test_webauthn,
    };
    use crate::webauthn::CEREMONY_TIMEOUT;
    use crate::webauthn::http::router;
    use crate::webauthn::registration::start_discoverable_registration;
    use crate::webauthn::repository::PasskeyRepository;
    use webauthn_authenticator_rs::WebauthnAuthenticator;

    fn test_app(pool: PgPool) -> Router {
        router(test_state(pool))
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

    fn login_options_request() -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/login-options")
            .body(Body::empty())
            .unwrap()
    }

    /// A syntactically valid but unverifiable assertion: enough to reach the
    /// ceremony lookup, never enough to pass verification.
    fn verify_login_request(login_id: &str) -> Request<Body> {
        json_request(
            "/verify-login",
            serde_json::json!({
                "loginId": login_id,
                "response": {
                    "id": "dGVzdA",
                    "rawId": "dGVzdA",
                    "response": {
                        "authenticatorData": "dGVzdA",
                        "clientDataJSON": "dGVzdA",
                        "signature": "dGVzdA",
                        "userHandle": null
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

    async fn start(app: &Router) -> LoginOptionsResponse {
        let response = app.clone().oneshot(login_options_request()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        serde_json::from_value(body_json(response).await).unwrap()
    }

    #[sqlx::test]
    async fn login_start_and_finish_signs_the_account_in(pool: PgPool) {
        let (mut authenticator, registered) = register_soft_passkey(&pool).await;
        let app = test_app(pool.clone());
        let options = start(&app).await;
        let assertion = soft_passkey_assertion(&mut authenticator, options.rcr);

        let response = app
            .oneshot(json_request(
                "/verify-login",
                serde_json::json!({
                    "loginId": options.login_id,
                    "response": assertion,
                }),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let token =
            session_cookie(&response, test_cookies().name()).expect("login signs the account in");
        let body = body_json(response).await;
        let account_id: Uuid = serde_json::from_value(body["accountId"].clone()).unwrap();
        assert_eq!(account_id, registered.account.id);
        let credential_id: CredentialID =
            serde_json::from_value(body["credentialId"].clone()).unwrap();
        assert_eq!(&credential_id, registered.credential.passkey.cred_id());
        // The stored credential stays server-side.
        assert!(body.get("credential").is_none());

        let credentials = PasskeyRepository::new(pool.clone())
            .list_for_account(account_id)
            .await
            .unwrap();
        assert!(credentials[0].last_used_at.is_some());

        // The cookie names a live session of the signed-in account.
        let (authenticated, _) = SessionService::new(pool)
            .authenticate(&token)
            .await
            .unwrap()
            .expect("the cookie must carry a live session");
        assert_eq!(authenticated.account.id, account_id);
    }

    /// The wire shape of a discoverable challenge: nothing names the user or
    /// the credential, and the authenticator must verify the user.
    #[sqlx::test]
    async fn login_options_ask_for_no_credential_in_particular(pool: PgPool) {
        let options = start(&test_app(pool)).await;
        let rcr = serde_json::to_value(options.rcr).unwrap();
        let public_key = &rcr["publicKey"];

        assert_eq!(public_key["allowCredentials"], serde_json::json!([]));
        assert_eq!(public_key["userVerification"], "required");
        assert_eq!(public_key["rpId"], "localhost");
        assert!(public_key["challenge"].is_string());
    }

    /// The challenge carries the same countdown the server stores the ceremony
    /// for, in milliseconds.
    #[sqlx::test]
    async fn login_options_send_the_ceremony_timeout(pool: PgPool) {
        let options = start(&test_app(pool)).await;

        assert_eq!(
            options.rcr.public_key.timeout,
            Some(u32::try_from(CEREMONY_TIMEOUT.as_millis()).expect("the timeout fits in a u32"))
        );
    }

    /// A credential CAS never stored answers a valid challenge: 401, and the
    /// body says nothing more specific than that.
    #[sqlx::test]
    async fn an_unregistered_credential_returns_401(pool: PgPool) {
        let webauthn = test_webauthn();
        let mut authenticator = WebauthnAuthenticator::new(ResidentSoftPasskey::new());
        let (ccr, _) = start_discoverable_registration(&webauthn, Uuid::new_v4(), "Ada").unwrap();
        authenticator.do_registration(test_origin(), ccr).unwrap();
        let app = test_app(pool);
        let options = start(&app).await;
        let assertion = soft_passkey_assertion(&mut authenticator, options.rcr);

        let response = app
            .oneshot(json_request(
                "/verify-login",
                serde_json::json!({
                    "loginId": options.login_id,
                    "response": assertion,
                }),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "invalid_credential"
        );
    }

    /// An assertion that cannot even be parsed as one — garbage in every
    /// field — is still a 401, never a panic or a 500.
    #[sqlx::test]
    async fn a_garbage_assertion_returns_401(pool: PgPool) {
        let app = test_app(pool);
        let options = start(&app).await;

        let response = app
            .oneshot(verify_login_request(&options.login_id.to_string()))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "invalid_credential"
        );
    }

    /// The challenge answers exactly one request; a replayed finish finds no
    /// ceremony left.
    #[sqlx::test]
    async fn finishing_a_login_twice_returns_404(pool: PgPool) {
        let (mut authenticator, _) = register_soft_passkey(&pool).await;
        let app = test_app(pool);
        let options = start(&app).await;
        let assertion = soft_passkey_assertion(&mut authenticator, options.rcr);
        let finish = || {
            json_request(
                "/verify-login",
                serde_json::json!({
                    "loginId": options.login_id,
                    "response": assertion,
                }),
            )
        };

        let first = app.clone().oneshot(finish()).await.unwrap();
        assert_eq!(first.status(), StatusCode::OK);

        let second = app.oneshot(finish()).await.unwrap();
        assert_eq!(second.status(), StatusCode::NOT_FOUND);
        assert_eq!(body_json(second).await["error"]["code"], "login_not_found");
    }

    #[sqlx::test]
    async fn verify_login_with_unknown_login_returns_404(pool: PgPool) {
        let response = test_app(pool)
            .oneshot(verify_login_request(&Uuid::new_v4().to_string()))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "login_not_found"
        );
    }

    #[tokio::test]
    async fn verify_login_with_invalid_login_id_returns_422() {
        let response = test_app_without_db()
            .oneshot(verify_login_request("not-a-uuid"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "invalid_body");
        assert!(body["error"]["message"].is_string());
    }

    #[tokio::test]
    async fn verify_login_with_malformed_json_body_returns_api_error() {
        let request = raw_request("/verify-login", "application/json", "{not json");

        let response = test_app_without_db().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(body_json(response).await["error"]["code"], "invalid_body");
    }

    /// A database that does not answer is a 503, never a 500: the client may
    /// retry, and the ceremony is still there when it does.
    #[tokio::test]
    async fn a_database_timeout_is_service_unavailable() {
        let error = FinishError::Db(sqlx::Error::PoolTimedOut);

        let response = ApiError::from(error).into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "database_unavailable"
        );
    }
}
