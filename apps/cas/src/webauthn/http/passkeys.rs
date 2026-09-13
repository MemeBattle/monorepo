//! `/api/passkeys` — the signed-in account's passkeys: list, rename, delete.
//! Every handler takes `Authenticated`, so an anonymous request is a 401
//! before anything here runs, and the account id comes from the session,
//! never from the request.

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, patch},
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::http::ApiState;
use crate::http::error::ApiError;
use crate::http::extract::{Json as AppJson, Path};
use crate::sessions::Authenticated;
use crate::webauthn::management::ManagementError;
use crate::webauthn::passkeys::{PasskeyCredential, PasskeyName, PasskeyNameError};

/// The name is validated by the handler rather than by the body type, so a bad
/// one gets this code instead of a generic `invalid_body`.
impl From<PasskeyNameError> for ApiError {
    fn from(error: PasskeyNameError) -> Self {
        ApiError::bad_request(
            "invalid_passkey_name",
            format!("Invalid passkey name: {error}"),
        )
    }
}

impl From<ManagementError> for ApiError {
    fn from(error: ManagementError) -> Self {
        let message = error.to_string();
        match error {
            ManagementError::NotFound => ApiError::not_found("passkey_not_found", message),
            // A conflict with the account's state, not a bad request: the
            // same request succeeds once another passkey exists.
            ManagementError::LastPasskey => ApiError::conflict("last_passkey", message),
            ManagementError::Db(error) => ApiError::from(error),
        }
    }
}

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/", get(list))
        .route("/{id}", patch(rename).delete(delete))
        .with_state(state)
}

/// A passkey as the dashboard shows it. The credential itself (public key,
/// counter, flags) is server-side state and never leaves.
#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyResponse {
    id: Uuid,
    name: String,
    #[serde(with = "time::serde::rfc3339")]
    created_at: OffsetDateTime,
    /// `null` until the passkey is first used to sign in.
    #[serde(with = "time::serde::rfc3339::option")]
    last_used_at: Option<OffsetDateTime>,
}

impl From<PasskeyCredential> for PasskeyResponse {
    fn from(credential: PasskeyCredential) -> Self {
        Self {
            id: credential.id,
            name: credential.name,
            created_at: credential.created_at,
            last_used_at: credential.last_used_at,
        }
    }
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyListResponse {
    passkeys: Vec<PasskeyResponse>,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePasskeyRequest {
    /// Validated by the handler rather than by the type, so a bad name gets
    /// its own error code instead of a generic `invalid_body`.
    name: String,
}

async fn list(
    State(state): State<ApiState>,
    authenticated: Authenticated,
) -> Result<Json<PasskeyListResponse>, ApiError> {
    let passkeys = state.passkeys.list(authenticated.account.id).await?;

    Ok(Json(PasskeyListResponse {
        passkeys: passkeys.into_iter().map(Into::into).collect(),
    }))
}

async fn rename(
    State(state): State<ApiState>,
    authenticated: Authenticated,
    Path(id): Path<Uuid>,
    AppJson(request): AppJson<RenamePasskeyRequest>,
) -> Result<Json<PasskeyResponse>, ApiError> {
    let name = PasskeyName::try_new(request.name)?;

    let renamed = state
        .passkeys
        .rename(authenticated.account.id, id, name)
        .await?;

    Ok(Json(renamed.into()))
}

async fn delete(
    State(state): State<ApiState>,
    authenticated: Authenticated,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    state.passkeys.delete(authenticated.account.id, id).await?;

    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, header},
    };
    use sqlx::PgPool;
    use tower::ServiceExt;

    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{register_soft_passkey, test_cookies, test_passkey, test_state};
    use crate::webauthn::passkeys::DEFAULT_PASSKEY_NAME;
    use crate::webauthn::repository::insert_passkey;

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    /// A signed-in account with its registration passkey: the cookie header,
    /// the account id and the passkey id.
    async fn signed_in(pool: &PgPool) -> (String, Uuid, Uuid) {
        let (_, registered) = register_soft_passkey(pool).await;
        let issued = SessionService::new(pool.clone())
            .create(registered.account.id, SessionOrigin::Registration)
            .await
            .unwrap();
        (
            format!("{}={}", test_cookies().name(), issued.token.expose()),
            registered.account.id,
            registered.credential.id,
        )
    }

    fn request(method: &str, uri: &str, cookie: Option<&str>, body: Option<&str>) -> Request<Body> {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        match body {
            Some(body) => request
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_owned()))
                .unwrap(),
            None => request.body(Body::empty()).unwrap(),
        }
    }

    #[sqlx::test]
    async fn every_endpoint_needs_a_session(pool: PgPool) {
        let app = router(test_state(pool));
        let id = Uuid::new_v4();

        for (method, uri, body) in [
            ("GET", "/".to_owned(), None),
            ("PATCH", format!("/{id}"), Some(r#"{"name":"x"}"#)),
            ("DELETE", format!("/{id}"), None),
        ] {
            let response = app
                .clone()
                .oneshot(request(method, &uri, None, body))
                .await
                .unwrap();

            assert_eq!(
                response.status(),
                StatusCode::UNAUTHORIZED,
                "{method} {uri}"
            );
            assert_eq!(
                body_json(response).await["error"]["code"],
                "unauthenticated"
            );
        }
    }

    #[sqlx::test]
    async fn list_shows_name_created_at_and_last_used_at(pool: PgPool) {
        let (cookie, account_id, passkey_id) = signed_in(&pool).await;
        insert_passkey(&pool, account_id, &test_passkey(), "Second")
            .await
            .unwrap();

        let response = router(test_state(pool))
            .oneshot(request("GET", "/", Some(&cookie), None))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_json(response).await;
        let passkeys = body["passkeys"].as_array().unwrap();
        assert_eq!(passkeys.len(), 2);
        assert_eq!(passkeys[0]["id"], passkey_id.to_string());
        assert_eq!(passkeys[0]["name"], DEFAULT_PASSKEY_NAME);
        assert!(passkeys[0]["createdAt"].is_string());
        assert!(passkeys[0]["lastUsedAt"].is_null(), "never used to sign in");
        assert_eq!(passkeys[1]["name"], "Second");
        assert!(
            passkeys[0].get("credential").is_none() && passkeys[0].get("credentialId").is_none(),
            "the credential stays server-side"
        );
    }

    #[sqlx::test]
    async fn rename_returns_the_renamed_passkey(pool: PgPool) {
        let (cookie, _, passkey_id) = signed_in(&pool).await;

        let response = router(test_state(pool))
            .oneshot(request(
                "PATCH",
                &format!("/{passkey_id}"),
                Some(&cookie),
                Some(r#"{"name":"  My YubiKey "}"#),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_json(response).await;
        assert_eq!(body["id"], passkey_id.to_string());
        assert_eq!(body["name"], "My YubiKey", "sanitised like a display name");
    }

    #[sqlx::test]
    async fn rename_refuses_an_invalid_name(pool: PgPool) {
        let (cookie, _, passkey_id) = signed_in(&pool).await;
        let app = router(test_state(pool));

        for body in [r#"{"name":""}"#, "{\"name\":\"a\u{200b}b\"}"] {
            let response = app
                .clone()
                .oneshot(request(
                    "PATCH",
                    &format!("/{passkey_id}"),
                    Some(&cookie),
                    Some(body),
                ))
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{body}");
            assert_eq!(
                body_json(response).await["error"]["code"],
                "invalid_passkey_name"
            );
        }
    }

    /// Someone else's passkey and no passkey at all get the same answer.
    #[sqlx::test]
    async fn rename_and_delete_of_a_passkey_that_is_not_yours_is_404(pool: PgPool) {
        let (cookie, _, _) = signed_in(&pool).await;
        let (_, other) = register_soft_passkey(&pool).await;
        let app = router(test_state(pool));

        for id in [other.credential.id, Uuid::new_v4()] {
            for (method, body) in [("PATCH", Some(r#"{"name":"Mine"}"#)), ("DELETE", None)] {
                let response = app
                    .clone()
                    .oneshot(request(method, &format!("/{id}"), Some(&cookie), body))
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::NOT_FOUND, "{method} {id}");
                assert_eq!(
                    body_json(response).await["error"]["code"],
                    "passkey_not_found"
                );
            }
        }
    }

    #[sqlx::test]
    async fn delete_removes_a_passkey_and_keeps_the_session(pool: PgPool) {
        let (cookie, account_id, passkey_id) = signed_in(&pool).await;
        insert_passkey(&pool, account_id, &test_passkey(), "Second")
            .await
            .unwrap();
        let app = router(test_state(pool));

        let response = app
            .clone()
            .oneshot(request(
                "DELETE",
                &format!("/{passkey_id}"),
                Some(&cookie),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let list = app
            .oneshot(request("GET", "/", Some(&cookie), None))
            .await
            .unwrap();
        assert_eq!(
            list.status(),
            StatusCode::OK,
            "the session opened with it lives on"
        );
        let body = body_json(list).await;
        assert_eq!(body["passkeys"].as_array().unwrap().len(), 1);
        assert_eq!(body["passkeys"][0]["name"], "Second");
    }

    #[sqlx::test]
    async fn deleting_the_last_passkey_is_a_conflict(pool: PgPool) {
        let (cookie, _, passkey_id) = signed_in(&pool).await;

        let response = router(test_state(pool))
            .oneshot(request(
                "DELETE",
                &format!("/{passkey_id}"),
                Some(&cookie),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        let body = body_json(response).await;
        assert_eq!(body["error"]["code"], "last_passkey");
        assert!(
            body["error"]["message"]
                .as_str()
                .unwrap()
                .contains("add another one first"),
            "{body}"
        );
    }

    /// A path segment that is not a uuid is a 400 in the standard shape, not
    /// axum's plain-text rejection.
    #[sqlx::test]
    async fn a_malformed_passkey_id_is_a_bad_request(pool: PgPool) {
        let (cookie, _, _) = signed_in(&pool).await;

        let response = router(test_state(pool))
            .oneshot(request("DELETE", "/not-a-uuid", Some(&cookie), None))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(body_json(response).await["error"]["code"], "invalid_path");
    }
}
