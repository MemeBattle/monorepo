//! The passkey addition endpoints, mounted with `/api/passkeys`: issuing a
//! challenge for another passkey of the signed-in account and verifying the
//! browser's answer. Both take `Authenticated`, so an anonymous request is a
//! 401 before anything here runs, and the account comes from the session,
//! never from the request.
//!
//! The ceremony's failures answer with the codes account registration uses
//! (`From<FinishError> for ApiError` next to that handler): it is the same
//! ceremony failing the same way, and the client's remedy is the same. What
//! differs is the outcome: no account, no session, and the passkey as the
//! list shows it. See `docs/adr/0006-passkey-management.md`, decision (g).

use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use webauthn_rs::prelude::{CreationChallengeResponse, RegisterPublicKeyCredential};

use crate::http::ApiState;
use crate::http::error::ApiError;
use crate::http::extract::Json as AppJson;
use crate::sessions::Authenticated;
use crate::webauthn::http::passkeys::PasskeyResponse;

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdditionOptionsResponse {
    /// Identifies the ceremony; the client brings it back to finish.
    registration_id: Uuid,
    ccr: CreationChallengeResponse,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyAdditionData {
    registration_id: Uuid,
    response: RegisterPublicKeyCredential,
}

/// `POST /api/passkeys/register-options`, no body: the challenge for another
/// passkey of the signed-in account, its existing credentials excluded.
pub(super) async fn get_registration_options(
    State(state): State<ApiState>,
    authenticated: Authenticated,
) -> Result<Json<AdditionOptionsResponse>, ApiError> {
    let started = state.addition.start(&authenticated.account).await?;

    Ok(Json(AdditionOptionsResponse {
        registration_id: started.registration_id,
        ccr: started.ccr,
    }))
}

/// `POST /api/passkeys/verify-registration`: stores the new passkey under the
/// session's account and answers `201` with it as `GET /api/passkeys` lists
/// it. The session is left as it is: the account was signed in already.
pub(super) async fn verify_registration(
    State(state): State<ApiState>,
    authenticated: Authenticated,
    AppJson(data): AppJson<VerifyAdditionData>,
) -> Result<(StatusCode, Json<PasskeyResponse>), ApiError> {
    let added = state
        .addition
        .finish(
            authenticated.account.id,
            data.registration_id,
            &data.response,
        )
        .await?;

    Ok((StatusCode::CREATED, Json(added.into())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Request, header},
    };
    use sqlx::{PgPool, postgres::PgPoolOptions};
    use tower::ServiceExt;
    use webauthn_authenticator_rs::{
        WebauthnAuthenticator,
        error::{CtapError, WebauthnCError},
    };

    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{
        ResidentSoftPasskey, register_soft_passkey, soft_passkey_registration, test_cookies,
        test_origin, test_passkey, test_state, test_webauthn,
    };
    use crate::webauthn::ceremonies::PendingAddition;
    use crate::webauthn::http::passkeys::router;
    use crate::webauthn::passkeys::DEFAULT_PASSKEY_NAME;
    use crate::webauthn::registration::Registered;
    use crate::webauthn::repository::insert_passkey;

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    /// A signed-in account with its registration passkey: the authenticator
    /// holding that passkey, what registration created, and the cookie.
    async fn signed_in(
        pool: &PgPool,
    ) -> (
        WebauthnAuthenticator<ResidentSoftPasskey>,
        Registered,
        String,
    ) {
        let (authenticator, registered) = register_soft_passkey(pool).await;
        let issued = SessionService::new(pool.clone())
            .create(registered.account.id, SessionOrigin::Registration)
            .await
            .unwrap();
        (
            authenticator,
            registered,
            format!("{}={}", test_cookies().name(), issued.token.expose()),
        )
    }

    fn request(uri: &str, cookie: Option<&str>, body: Option<serde_json::Value>) -> Request<Body> {
        let mut request = Request::builder().method("POST").uri(uri);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        match body {
            Some(body) => request
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
            None => request.body(Body::empty()).unwrap(),
        }
    }

    fn list_request(cookie: &str) -> Request<Body> {
        Request::builder()
            .uri("/")
            .header(header::COOKIE, cookie)
            .body(Body::empty())
            .unwrap()
    }

    async fn start(app: &Router, cookie: &str) -> AdditionOptionsResponse {
        let response = app
            .clone()
            .oneshot(request("/register-options", Some(cookie), None))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        serde_json::from_value(body_json(response).await).unwrap()
    }

    fn finish_body(
        registration_id: Uuid,
        response: &RegisterPublicKeyCredential,
    ) -> serde_json::Value {
        serde_json::json!({
            "registrationId": registration_id,
            "response": response,
        })
    }

    async fn ceremony_count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM webauthn_ceremonies")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Both endpoints refuse before any query, so a lazy pool that never
    /// connects is enough.
    #[tokio::test]
    async fn both_endpoints_need_a_session() {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://unused")
            .expect("a lazy pool needs no database");
        let app = router(test_state(pool));

        for (uri, body) in [
            ("/register-options", None),
            (
                "/verify-registration",
                Some(serde_json::json!({ "registrationId": Uuid::new_v4(), "response": {} })),
            ),
        ] {
            let response = app.clone().oneshot(request(uri, None, body)).await.unwrap();

            assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{uri}");
            assert_eq!(
                body_json(response).await["error"]["code"],
                "unauthenticated"
            );
        }
    }

    /// The two requests of the ceremony land on two different instances —
    /// two states built on the same database and nothing else in common —
    /// because in production they may. The finish answers with the passkey,
    /// opens no session and creates no account; the list then shows both.
    #[sqlx::test]
    async fn a_signed_in_account_adds_a_passkey_and_the_list_shows_both(pool: PgPool) {
        let (_, registered, cookie) = signed_in(&pool).await;
        let first_replica = router(test_state(pool.clone()));
        let second_replica = router(test_state(pool.clone()));

        let options = start(&first_replica, &cookie).await;
        let attestation = soft_passkey_registration(options.ccr);
        let response = second_replica
            .clone()
            .oneshot(request(
                "/verify-registration",
                Some(&cookie),
                Some(finish_body(options.registration_id, &attestation)),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
        assert!(
            !response.headers().contains_key(header::SET_COOKIE),
            "the account was signed in already; no session is opened"
        );
        let body = body_json(response).await;
        let added: Uuid = serde_json::from_value(body["id"].clone()).unwrap();
        assert_ne!(added, registered.credential.id);
        assert_eq!(body["name"], DEFAULT_PASSKEY_NAME);
        assert!(body["createdAt"].is_string());
        assert!(body["lastUsedAt"].is_null());
        assert!(
            body.get("credential").is_none()
                && body.get("credentialId").is_none()
                && body.get("accountId").is_none(),
            "the credential stays server-side: {body}"
        );

        let list = second_replica.oneshot(list_request(&cookie)).await.unwrap();
        assert_eq!(list.status(), StatusCode::OK);
        let passkeys = body_json(list).await["passkeys"].clone();
        assert_eq!(
            passkeys
                .as_array()
                .unwrap()
                .iter()
                .map(|p| p["id"].as_str().unwrap().to_owned())
                .collect::<Vec<_>>(),
            [registered.credential.id.to_string(), added.to_string()]
        );
        // Unchecked queries: see docs/TESTS.md.
        let accounts: i64 = sqlx::query_scalar("SELECT count(*) FROM accounts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(accounts, 1);
        let sessions: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(sessions, 1);
        assert_eq!(ceremony_count(&pool).await, 0);
    }

    /// The challenge names the account's passkeys in `excludeCredentials`
    /// and asks for the same credential as registration does; the
    /// authenticator that holds one of the account's passkeys refuses it
    /// before any request reaches the finish.
    #[sqlx::test]
    async fn register_options_exclude_the_account_passkeys(pool: PgPool) {
        let (mut registered_device, registered, cookie) = signed_in(&pool).await;
        let second = insert_passkey(&pool, registered.account.id, &test_passkey(), "Second")
            .await
            .unwrap();
        let (_, other) = register_soft_passkey(&pool).await;

        let options = start(&router(test_state(pool)), &cookie).await;

        let public_key = serde_json::to_value(&options.ccr.public_key).unwrap();
        let mut excluded: Vec<Vec<u8>> = options
            .ccr
            .public_key
            .exclude_credentials
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|descriptor| descriptor.id.to_vec())
            .collect();
        excluded.sort();
        let mut expected = vec![registered.credential.credential_id, second.credential_id];
        expected.sort();
        assert_eq!(excluded, expected);
        assert!(!excluded.contains(&other.credential.credential_id));
        assert_eq!(public_key["excludeCredentials"][0]["type"], "public-key");
        assert_eq!(
            public_key["user"]["id"],
            serde_json::to_value(webauthn_rs::prelude::Base64UrlSafeData::from(
                registered.account.id.as_bytes().to_vec()
            ))
            .unwrap()
        );
        assert_eq!(public_key["user"]["name"], "Ada");
        let selection = &public_key["authenticatorSelection"];
        assert_eq!(selection["residentKey"], "required");
        assert_eq!(selection["requireResidentKey"], true);
        assert_eq!(selection["userVerification"], "required");
        let error = registered_device
            .do_registration(test_origin(), options.ccr)
            .unwrap_err();
        assert!(matches!(
            error,
            WebauthnCError::Ctap(CtapError::Ctap2CredentialExcluded)
        ));
    }

    /// A client that ignores `excludeCredentials` and answers with a
    /// credential the account already has: the duplicate is produced by
    /// storing the minted credential before the finish, and the finish is
    /// refused with the code registration uses for the same condition.
    #[sqlx::test]
    async fn re_registering_a_passkey_the_account_has_is_a_conflict(pool: PgPool) {
        let (_, registered, cookie) = signed_in(&pool).await;
        let app = router(test_state(pool.clone()));
        let options = start(&app, &cookie).await;
        let attestation = soft_passkey_registration(options.ccr);
        // Unchecked query: see docs/TESTS.md.
        let state: serde_json::Value =
            sqlx::query_scalar("SELECT state FROM webauthn_ceremonies WHERE id = $1")
                .bind(options.registration_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        let pending: PendingAddition = serde_json::from_value(state).unwrap();
        let passkey = test_webauthn()
            .finish_passkey_registration(&attestation, &pending.state.passkey)
            .unwrap();
        insert_passkey(&pool, registered.account.id, &passkey, "Same device")
            .await
            .unwrap();

        let response = app
            .clone()
            .oneshot(request(
                "/verify-registration",
                Some(&cookie),
                Some(finish_body(options.registration_id, &attestation)),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "credential_already_registered"
        );
        let list = body_json(app.oneshot(list_request(&cookie)).await.unwrap()).await;
        assert_eq!(list["passkeys"].as_array().unwrap().len(), 2);
    }

    /// The challenge answers exactly one request.
    #[sqlx::test]
    async fn finishing_twice_is_not_found(pool: PgPool) {
        let (_, _, cookie) = signed_in(&pool).await;
        let app = router(test_state(pool));
        let options = start(&app, &cookie).await;
        let attestation = soft_passkey_registration(options.ccr);
        let finish = || {
            request(
                "/verify-registration",
                Some(&cookie),
                Some(finish_body(options.registration_id, &attestation)),
            )
        };

        let first = app.clone().oneshot(finish()).await.unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);

        let second = app.oneshot(finish()).await.unwrap();
        assert_eq!(second.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            body_json(second).await["error"]["code"],
            "registration_not_found"
        );
    }

    /// A ceremony started under one session and finished under another
    /// account's: not found, and consumed.
    #[sqlx::test]
    async fn another_accounts_session_cannot_finish_the_ceremony(pool: PgPool) {
        let (_, _, ada) = signed_in(&pool).await;
        let (_, _, bob) = signed_in(&pool).await;
        let app = router(test_state(pool.clone()));
        let options = start(&app, &ada).await;
        let attestation = soft_passkey_registration(options.ccr);

        let response = app
            .clone()
            .oneshot(request(
                "/verify-registration",
                Some(&bob),
                Some(finish_body(options.registration_id, &attestation)),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "registration_not_found"
        );
        assert_eq!(ceremony_count(&pool).await, 0);
        for cookie in [&ada, &bob] {
            let list = body_json(app.clone().oneshot(list_request(cookie)).await.unwrap()).await;
            assert_eq!(list["passkeys"].as_array().unwrap().len(), 1);
        }
    }

    #[sqlx::test]
    async fn a_wrong_answer_is_a_verification_failure(pool: PgPool) {
        let (_, _, cookie) = signed_in(&pool).await;
        let app = router(test_state(pool));
        let options = start(&app, &cookie).await;
        let other = start(&app, &cookie).await;
        let attestation = soft_passkey_registration(other.ccr);

        let response = app
            .oneshot(request(
                "/verify-registration",
                Some(&cookie),
                Some(finish_body(options.registration_id, &attestation)),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "registration_verification_failed"
        );
    }

    #[sqlx::test]
    async fn a_malformed_body_is_invalid_body(pool: PgPool) {
        let (_, _, cookie) = signed_in(&pool).await;

        let response = router(test_state(pool))
            .oneshot(request(
                "/verify-registration",
                Some(&cookie),
                Some(serde_json::json!({ "registrationId": "not-a-uuid", "response": {} })),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(body_json(response).await["error"]["code"], "invalid_body");
    }
}
