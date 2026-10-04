//! The passkey registration endpoints: issuing a challenge and verifying the
//! browser's answer.
//!
//! Without a session, or with a full one, they create an account. Under an
//! upgrade session — which `/oidc/authorize` opened for a guest's `id_token_hint`
//! — the same two requests run the guest upgrade instead: the passkey goes
//! to the guest, which becomes a full account with the same id, and the
//! upgrade session is rotated into a full one (ADR 0015 (e)). The session
//! decides, not a parameter; the request and response bodies are the same.
//! These are the only `/api` endpoints an upgrade session may use besides
//! the read of `GET /api/me` (ADR 0018), and the only ones whose behaviour it
//! changes, which is why they read the session with `resolve_session` rather
//! than through the `Authenticated` extractor, which refuses one.

use axum::{
    extract::{OriginalUri, State},
    http::{Extensions, HeaderMap},
};
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use webauthn_rs::prelude::{CreationChallengeResponse, CredentialID, RegisterPublicKeyCredential};

use crate::accounts::{DisplayName, DisplayNameError};
use crate::http::ApiState;
use crate::http::error::ApiErrors;
use crate::http::extract::{InvalidBody, Json, original_path};
use crate::sessions::http::WithSessionCookie;
use crate::sessions::http::extract::resolve_session;
use crate::sessions::service::CreateError;
use crate::sessions::{Authenticated, SessionKind, SessionOrigin};
use crate::webauthn::registration::{FinishError, StartError};
use crate::webauthn::upgrade::UpgradeError;

// The name is validated by the handler rather than by the body type, so a
// bad one gets this code instead of a generic `invalid_body`.
crate::api_errors!(DisplayNameError => BAD_REQUEST "invalid_display_name",
    |error| format!("Invalid display name: {error}"));

crate::api_errors! { StartError {
    // webauthn-rs refusing to issue a challenge for a valid relying party is
    // nothing this code can name.
    Webauthn(_) => internal,
    Db(_) => from,
} }

crate::api_errors! { FinishError {
    NotFound => NOT_FOUND "registration_not_found",
    Verification(_) => BAD_REQUEST "registration_verification_failed",
    CredentialAlreadyRegistered => CONFLICT "credential_already_registered",
    DiscoverableCredentialRequired => BAD_REQUEST "discoverable_credential_required",
    Db(_) => from,
} }

// The upgrade fails the way a registration does, with the same codes, plus
// the two ways only it can fail.
crate::api_errors! { UpgradeError {
    Finish(_) => from,
    // The upgrade session is gone or its account is full already: the same
    // answer, code and message, as a request with no session behind the
    // extractor.
    SessionEnded => UNAUTHORIZED "unauthenticated": "Sign in to continue",
    // The OS refusing randomness for the new session token, as when a
    // session is created.
    Random(_) => internal,
} }

/// The upgrade session the request carries, if it carries one. Any other
/// state — no cookie, a dead one, a full session — is `None`, and the
/// request is an ordinary registration.
async fn upgrade_session(
    state: &ApiState,
    headers: &HeaderMap,
    extensions: &Extensions,
    uri: &axum::http::Uri,
) -> Result<Option<Authenticated>, sqlx::Error> {
    let path = original_path(extensions, uri);
    let authenticated = resolve_session(state, headers, extensions, path).await?;
    Ok(authenticated.filter(|authenticated| authenticated.session.kind == SessionKind::Upgrade))
}

#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationOptionsRequest {
    /// Validated by the handler rather than by the type, so a bad name gets
    /// its own error code instead of a generic `invalid_body`.
    display_name: String,
}

#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationOptionsResponse {
    /// Identifies the ceremony; the client brings it back to finish. Not the
    /// account id, which only a finished registration reveals.
    registration_id: Uuid,
    /// The `PublicKeyCredentialCreationOptions` for `navigator.credentials.create`.
    #[schema(value_type = Object)]
    ccr: CreationChallengeResponse,
}

#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRegistrationData {
    registration_id: Uuid,
    /// The browser's `PublicKeyCredential` answer, JSON-encoded.
    #[schema(value_type = Object)]
    response: RegisterPublicKeyCredential,
}

/// What the client needs after a successful registration: who it now is, and
/// which credential was stored. The credential itself is server-side state and
/// is never sent back.
#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRegistrationResponse {
    account_id: Uuid,
    /// Base64url.
    #[schema(value_type = String)]
    credential_id: CredentialID,
}

crate::error_set!(pub(super) RegistrationOptionsErrors:
    InvalidBody, DisplayNameError, sqlx::Error, StartError);

/// The challenge for a new account, or, under an upgrade session, for the
/// guest's first passkey with the guest's id as the user handle.
#[utoipa::path(
    post,
    path = "/register-options",
    operation_id = "get_registration_options"
)]
pub(super) async fn get_registration_options(
    State(state): State<ApiState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    extensions: Extensions,
    Json(request): Json<RegistrationOptionsRequest>,
) -> Result<Json<RegistrationOptionsResponse>, ApiErrors<RegistrationOptionsErrors>> {
    let display_name = DisplayName::try_new(request.display_name)?;

    let started = match upgrade_session(&state, &headers, &extensions, &uri).await? {
        Some(upgrade) => state.upgrade.start(&upgrade.account, display_name).await?,
        None => state.registration.start(display_name).await?,
    };

    Ok(Json(RegistrationOptionsResponse {
        registration_id: started.registration_id,
        ccr: started.ccr,
    }))
}

crate::error_set!(pub(super) VerifyRegistrationErrors:
    InvalidBody, sqlx::Error, UpgradeError, FinishError, CreateError);

/// A finished registration signs the new account in: the response sets the
/// session cookie alongside the body. Under an upgrade session the guest is
/// upgraded instead, and the cookie is the full session the upgrade session
/// was rotated into, inside the upgrade's transaction.
#[utoipa::path(
    post,
    path = "/verify-registration",
    operation_id = "verify_registration"
)]
pub(super) async fn verify_registration(
    State(state): State<ApiState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    extensions: Extensions,
    jar: CookieJar,
    Json(data): Json<VerifyRegistrationData>,
) -> Result<WithSessionCookie<Json<VerifyRegistrationResponse>>, ApiErrors<VerifyRegistrationErrors>>
{
    if let Some(upgrade) = upgrade_session(&state, &headers, &extensions, &uri).await? {
        let upgraded = state
            .upgrade
            .finish(&upgrade.session, data.registration_id, &data.response)
            .await?;
        return Ok(WithSessionCookie(
            jar.add(
                state
                    .cookies
                    .session(&upgraded.issued.token, &upgraded.issued.session),
            ),
            Json(VerifyRegistrationResponse {
                account_id: upgraded.account.id,
                credential_id: upgraded.credential.passkey.cred_id().clone(),
            }),
        ));
    }

    let registered = state
        .registration
        .finish(data.registration_id, &data.response)
        .await?;
    let issued = state
        .sessions
        .create(registered.account.id, SessionOrigin::Registration)
        .await?;

    Ok(WithSessionCookie(
        jar.add(state.cookies.session(&issued.token, &issued.session)),
        Json(VerifyRegistrationResponse {
            account_id: registered.account.id,
            credential_id: registered.credential.passkey.cred_id().clone(),
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

    use crate::accounts::{AccountRepository, AccountType};
    use crate::http::error::ApiError;
    use crate::sessions::SessionService;
    use crate::testing::{
        checked, session_cookie, soft_passkey_registration, test_cookies, test_state,
    };
    use crate::webauthn::CEREMONY_TIMEOUT;
    use crate::webauthn::http::router;
    use crate::webauthn::passkeys::DEFAULT_PASSKEY_NAME;
    use crate::webauthn::repository::PasskeyRepository;

    fn test_app(pool: PgPool) -> Router {
        checked(router(test_state(pool)))
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
        let token = session_cookie(&response, test_cookies().name())
            .expect("registration signs the account in");
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
        assert_eq!(account.display_name.as_ref(), "Ada");
        assert_eq!(account.r#type, AccountType::Full);

        let credentials = PasskeyRepository::new(pool.clone())
            .list_for_account(account_id)
            .await
            .unwrap();
        assert_eq!(credentials.len(), 1);
        assert_eq!(credentials[0].name, DEFAULT_PASSKEY_NAME);

        // The cookie names a live session of the new account.
        let (authenticated, _) = SessionService::new(pool)
            .authenticate(&token)
            .await
            .unwrap()
            .expect("the cookie must carry a live session");
        assert_eq!(authenticated.account.id, account_id);
    }

    fn with_cookie(mut request: Request<Body>, cookie: &str) -> Request<Body> {
        request
            .headers_mut()
            .insert(header::COOKIE, cookie.parse().unwrap());
        request
    }

    /// Under an upgrade session the same two requests upgrade the guest: the
    /// challenge's user handle is the guest's id, the finish answers with
    /// that id, and its cookie is a new full session while the upgrade
    /// session's cookie no longer authenticates (ADR 0015 (e), (f)).
    #[sqlx::test]
    async fn under_an_upgrade_session_registration_upgrades_the_guest(pool: PgPool) {
        let upgrade = crate::testing::upgrade_signed_in(&pool).await;
        let app = test_app(pool.clone());

        let response = app
            .clone()
            .oneshot(with_cookie(
                register_options_request("Ada"),
                &upgrade.cookie,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let options: RegistrationOptionsResponse =
            serde_json::from_value(body_json(response).await).unwrap();
        let user_id = Uuid::from_slice(options.ccr.public_key.user.id.as_ref()).unwrap();
        assert_eq!(user_id, upgrade.account.id);
        let attestation = soft_passkey_registration(options.ccr);

        let response = app
            .oneshot(with_cookie(
                json_request(
                    "/verify-registration",
                    serde_json::json!({
                        "registrationId": options.registration_id,
                        "response": attestation,
                    }),
                ),
                &upgrade.cookie,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let token = session_cookie(&response, test_cookies().name())
            .expect("the upgrade rotates the session");
        assert_ne!(token, upgrade.token);
        let body = body_json(response).await;
        assert_eq!(body["accountId"], upgrade.account.id.to_string());

        let account = AccountRepository::new(pool.clone())
            .get(upgrade.account.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(account.r#type, AccountType::Full);
        assert_eq!(account.display_name.as_ref(), "Ada");
        let sessions = SessionService::new(pool);
        let (authenticated, _) = sessions
            .authenticate(&token)
            .await
            .unwrap()
            .expect("the new cookie carries a live session");
        assert_eq!(authenticated.account.id, upgrade.account.id);
        assert_eq!(authenticated.session.kind, SessionKind::Full);
        assert_eq!(sessions.authenticate(&upgrade.token).await.unwrap(), None);
    }

    /// An upgrade ceremony is finished by its upgrade session only: without
    /// it, the id names no registration.
    #[sqlx::test]
    async fn an_upgrade_ceremony_without_its_session_is_not_found(pool: PgPool) {
        let upgrade = crate::testing::upgrade_signed_in(&pool).await;
        let app = test_app(pool.clone());
        let response = app
            .clone()
            .oneshot(with_cookie(
                register_options_request("Ada"),
                &upgrade.cookie,
            ))
            .await
            .unwrap();
        let options: RegistrationOptionsResponse =
            serde_json::from_value(body_json(response).await).unwrap();
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

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "registration_not_found"
        );
        let account = AccountRepository::new(pool)
            .get(upgrade.account.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(account.r#type, AccountType::Guest);
    }

    /// An upgrade that lost its session — revoked, or the guest upgraded by
    /// another browser — answers like a request with no session.
    #[tokio::test]
    async fn an_ended_upgrade_session_is_unauthenticated() {
        let response = ApiError::from(UpgradeError::SessionEnded).into_response();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "unauthenticated"
        );
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
            "\u{034f}",
            "\u{fe0f}",
            "\u{3164}",
            "\u{fe0f}\u{200d}\u{fe0f}",
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

    /// The challenge carries the same countdown the server stores the ceremony
    /// for, in milliseconds. If the two ever drift apart, one side gives up
    /// while the other is still waiting.
    #[sqlx::test]
    async fn register_options_sends_the_ceremony_timeout(pool: PgPool) {
        let app = test_app(pool);

        let options = start(&app, "Ada").await;

        assert_eq!(
            options.ccr.public_key.timeout,
            Some(u32::try_from(CEREMONY_TIMEOUT.as_millis()).expect("the timeout fits in a u32"))
        );
        assert_eq!(options.ccr.public_key.timeout, Some(300_000));
    }

    #[sqlx::test]
    async fn register_options_requires_discoverable_credentials_and_user_verification(
        pool: PgPool,
    ) {
        let options = start(&test_app(pool), "Ada").await;
        let public_key = serde_json::to_value(options.ccr.public_key).unwrap();
        let selection = &public_key["authenticatorSelection"];
        assert_eq!(selection["residentKey"], "required");
        assert_eq!(selection["requireResidentKey"], true);
        assert_eq!(selection["userVerification"], "required");
        assert!(selection.get("authenticatorAttachment").is_none());
        assert_eq!(public_key["attestation"], "none");
        assert_eq!(public_key["extensions"]["credProps"], true);
    }

    #[sqlx::test]
    async fn a_non_discoverable_registration_returns_a_specific_error(pool: PgPool) {
        let app = test_app(pool);
        let options = start(&app, "Ada").await;
        let mut response = soft_passkey_registration(options.ccr);
        response.extensions.cred_props = Some(webauthn_rs_proto::CredProps { rk: Some(false) });
        let response = app
            .oneshot(json_request(
                "/verify-registration",
                serde_json::json!({
                    "registrationId": options.registration_id,
                    "response": response,
                }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "discoverable_credential_required"
        );
    }

    #[sqlx::test]
    async fn register_options_normalises_the_display_name(pool: PgPool) {
        let app = test_app(pool);

        let options = start(&app, "  Ada   Lovelace  ").await;

        assert_eq!(options.ccr.public_key.user.name, "Ada Lovelace");
        assert_eq!(options.ccr.public_key.user.display_name, "Ada Lovelace");
    }

    /// Emoji reach the authenticator prompt exactly as typed, variation
    /// selector included.
    #[sqlx::test]
    async fn register_options_keeps_an_emoji_display_name(pool: PgPool) {
        let app = test_app(pool);

        let options = start(&app, "Ada \u{2764}\u{fe0f}").await;

        assert_eq!(options.ccr.public_key.user.name, "Ada \u{2764}\u{fe0f}");
        assert_eq!(
            options.ccr.public_key.user.display_name,
            "Ada \u{2764}\u{fe0f}"
        );
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
        let error = FinishError::CredentialAlreadyRegistered;

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
        let error = FinishError::Db(sqlx::Error::PoolTimedOut);

        let response = ApiError::from(error).into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "database_unavailable"
        );
    }
}
