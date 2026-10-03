//! `/api/passkeys` — the signed-in account's passkeys: list, rename, delete,
//! and the ceremony that adds one ([`addition`](super::addition)). Every
//! handler takes `Authenticated`, so an anonymous request is a 401 before
//! anything here runs, and the account id comes from the session, never from
//! the request.

use axum::extract::State;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use utoipa::{OpenApi, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use crate::http::ApiState;
use crate::http::error::ApiErrors;
use crate::http::extract::{InvalidBody, InvalidPath, Json, Path};
use crate::http::response::NoContent;
use crate::sessions::Authenticated;
use crate::webauthn::management::ManagementError;
use crate::webauthn::passkeys::{PasskeyCredential, PasskeyName, PasskeyNameError};

// The name is validated by the handler rather than by the body type, so a
// bad one gets this code instead of a generic `invalid_body`.
crate::api_errors!(PasskeyNameError => BAD_REQUEST "invalid_passkey_name",
    |error| format!("Invalid passkey name: {error}"));

crate::api_errors! { ManagementError {
    NotFound => NOT_FOUND "passkey_not_found",
    // A conflict with the account's state, not a bad request: the same
    // request succeeds once another passkey exists.
    LastPasskey => CONFLICT "last_passkey",
    Db(_) => from,
} }

/// The response bodies of `/api/passkeys`, for the description.
#[derive(OpenApi)]
#[openapi(components(schemas(
    PasskeyResponse,
    PasskeyListResponse,
    super::addition::AdditionOptionsResponse,
)))]
struct PasskeysApi;

pub fn router(state: ApiState) -> OpenApiRouter {
    OpenApiRouter::with_openapi(PasskeysApi::openapi())
        .routes(routes!(list))
        .routes(routes!(super::addition::get_registration_options))
        .routes(routes!(super::addition::verify_registration))
        .routes(routes!(rename, delete))
        .with_state(state)
}

/// A passkey as the dashboard shows it. The credential itself (public key,
/// counter, flags) is server-side state and never leaves.
#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyResponse {
    id: Uuid,
    name: String,
    #[serde(with = "time::serde::rfc3339")]
    created_at: OffsetDateTime,
    /// `null` until the passkey is first used to sign in.
    #[serde(with = "time::serde::rfc3339::option")]
    #[schema(required)]
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

#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyListResponse {
    passkeys: Vec<PasskeyResponse>,
}

#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RenamePasskeyRequest {
    /// Validated by the handler rather than by the type, so a bad name gets
    /// its own error code instead of a generic `invalid_body`.
    name: String,
}

crate::error_set!(ListErrors: Authenticated, sqlx::Error);

/// The account's passkeys.
#[utoipa::path(get, path = "/", security(("session" = [])))]
async fn list(
    State(state): State<ApiState>,
    authenticated: Authenticated,
) -> Result<Json<PasskeyListResponse>, ApiErrors<ListErrors>> {
    let passkeys = state.passkeys.list(authenticated.account.id).await?;

    Ok(Json(PasskeyListResponse {
        passkeys: passkeys.into_iter().map(Into::into).collect(),
    }))
}

crate::error_set!(RenameErrors:
    Authenticated, InvalidPath, InvalidBody, PasskeyNameError, ManagementError);

/// Renames one of the account's passkeys.
#[utoipa::path(patch, path = "/{id}", security(("session" = [])))]
async fn rename(
    State(state): State<ApiState>,
    authenticated: Authenticated,
    Path(id): Path<Uuid>,
    Json(request): Json<RenamePasskeyRequest>,
) -> Result<Json<PasskeyResponse>, ApiErrors<RenameErrors>> {
    let name = PasskeyName::try_new(request.name)?;

    let renamed = state
        .passkeys
        .rename(authenticated.account.id, id, name)
        .await?;

    Ok(Json(renamed.into()))
}

crate::error_set!(DeleteErrors: Authenticated, InvalidPath, ManagementError);

/// Deletes one of the account's passkeys, never its last one.
#[utoipa::path(delete, path = "/{id}", security(("session" = [])))]
async fn delete(
    State(state): State<ApiState>,
    authenticated: Authenticated,
    Path(id): Path<Uuid>,
) -> Result<NoContent, ApiErrors<DeleteErrors>> {
    state.passkeys.delete(authenticated.account.id, id).await?;

    Ok(NoContent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
    };
    use sqlx::PgPool;
    use tower::ServiceExt;

    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{checked, register_soft_passkey, test_cookies, test_passkey, test_state};
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

    /// An upgrade session is no session here (ADR 0015 (a)): listing,
    /// renaming and deleting are the same 401 as with no cookie.
    #[sqlx::test]
    async fn an_upgrade_session_is_unauthenticated(pool: PgPool) {
        let upgrade = crate::testing::upgrade_signed_in(&pool).await;
        let app = checked(router(test_state(pool)));
        let id = Uuid::new_v4();

        for (method, uri, body) in [
            ("GET", "/".to_owned(), None),
            ("PATCH", format!("/{id}"), Some(r#"{"name":"x"}"#)),
            ("DELETE", format!("/{id}"), None),
        ] {
            let response = app
                .clone()
                .oneshot(request(method, &uri, Some(&upgrade.cookie), body))
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
    async fn every_endpoint_needs_a_session(pool: PgPool) {
        let app = checked(router(test_state(pool)));
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

        let response = checked(router(test_state(pool)))
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

        let response = checked(router(test_state(pool)))
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
        let app = checked(router(test_state(pool)));

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
        let app = checked(router(test_state(pool)));

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
        let app = checked(router(test_state(pool)));

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

        let response = checked(router(test_state(pool)))
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

        let response = checked(router(test_state(pool)))
            .oneshot(request("DELETE", "/not-a-uuid", Some(&cookie), None))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(body_json(response).await["error"]["code"], "invalid_path");
    }
}
