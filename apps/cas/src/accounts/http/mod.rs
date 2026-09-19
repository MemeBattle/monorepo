//! `PATCH /api/me` — what the signed-in account may change about itself: in
//! v1 the email, set or cleared. The read half of `/api/me` is the session's
//! (`crate::sessions::http`); this router is merged at the same path, so the
//! two verbs meet on one resource. The handler takes `Authenticated`, so an
//! anonymous request is a 401 before the body is read, and the account id
//! comes from the session, never from the request. Mounted by the transport
//! root in `crate::http`.

use axum::{Router, extract::State, http::StatusCode, routing::patch};
use serde::{Deserialize, Serialize};

use crate::accounts::management::UpdateEmailError;
use crate::accounts::{Email, EmailError};
use crate::http::ApiState;
use crate::http::error::ApiError;
use crate::http::extract::Json as AppJson;
use crate::sessions::Authenticated;

/// The address is validated by the handler rather than by the body type, so a
/// bad one gets this code instead of a generic `invalid_body`.
impl From<EmailError> for ApiError {
    fn from(error: EmailError) -> Self {
        ApiError::bad_request("invalid_email", format!("Invalid email: {error}"))
    }
}

impl From<UpdateEmailError> for ApiError {
    fn from(error: UpdateEmailError) -> Self {
        let message = error.to_string();
        match error {
            UpdateEmailError::AccountNotFound => ApiError::not_found("account_not_found", message),
            UpdateEmailError::Db(error) => ApiError::from(error),
        }
    }
}

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/me", patch(update_me))
        .with_state(state)
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMeRequest {
    /// `null` clears the address. The field is required: with the serde
    /// default a missing key would read as `null` and clear the address a
    /// client never mentioned. Validated by the handler rather than by the
    /// type, so a bad address gets its own error code.
    #[serde(deserialize_with = "Option::deserialize")]
    email: Option<String>,
}

/// Idempotent: the same body twice leaves the same account, and clearing an
/// absent email is a `204` like any other. Nothing is returned; the
/// dashboard reads the account back through `GET /api/me`.
async fn update_me(
    State(state): State<ApiState>,
    authenticated: Authenticated,
    AppJson(request): AppJson<UpdateMeRequest>,
) -> Result<StatusCode, ApiError> {
    let email = request.email.map(Email::try_new).transpose()?;

    state
        .accounts
        .set_email(authenticated.account.id, email)
        .await?;

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

    use crate::accounts::{AccountRepository, NewAccount};
    use crate::sessions::http as sessions_http;
    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{display_name, test_cookies, test_state};

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    /// Both halves of `/me`, merged the way the transport root mounts them:
    /// the write under test and the read it round-trips through.
    fn app(pool: PgPool) -> Router {
        let state = test_state(pool);
        Router::new()
            .merge(sessions_http::router(state.clone()))
            .merge(router(state))
    }

    /// A signed-in account without an email; returns the cookie header.
    async fn signed_in(pool: &PgPool) -> String {
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let issued = SessionService::new(pool.clone())
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        format!("{}={}", test_cookies().name(), issued.token.expose())
    }

    fn patch_me(cookie: Option<&str>, body: &str) -> Request<Body> {
        let mut request = Request::builder().method("PATCH").uri("/me");
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        request
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_owned()))
            .unwrap()
    }

    fn get_me(cookie: &str) -> Request<Body> {
        Request::builder()
            .uri("/me")
            .header(header::COOKIE, cookie)
            .body(Body::empty())
            .unwrap()
    }

    async fn email_of(app: &Router, cookie: &str) -> serde_json::Value {
        let response = app.clone().oneshot(get_me(cookie)).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        body_json(response).await["email"].clone()
    }

    #[sqlx::test]
    async fn setting_changing_and_clearing_round_trip_through_me(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let app = app(pool);
        assert!(email_of(&app, &cookie).await.is_null());

        for (body, expected) in [
            (
                r#"{"email":"ada@example.com"}"#,
                serde_json::json!("ada@example.com"),
            ),
            (
                r#"{"email":"lovelace@example.org"}"#,
                serde_json::json!("lovelace@example.org"),
            ),
            (r#"{"email":null}"#, serde_json::Value::Null),
        ] {
            let response = app
                .clone()
                .oneshot(patch_me(Some(&cookie), body))
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::NO_CONTENT, "{body}");
            assert_eq!(email_of(&app, &cookie).await, expected, "{body}");
        }
    }

    /// The stored form is the sanitised one: trimmed, the domain lower-cased
    /// and the local part as typed.
    #[sqlx::test]
    async fn the_address_is_stored_normalised(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let app = app(pool);

        let response = app
            .clone()
            .oneshot(patch_me(
                Some(&cookie),
                r#"{"email":"  Ada.Lovelace@Example.COM "}"#,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(email_of(&app, &cookie).await, "Ada.Lovelace@example.com");
    }

    /// Clearing what is already clear, and setting what is already set, are
    /// the same `204` as the first time.
    #[sqlx::test]
    async fn the_update_is_idempotent(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let app = app(pool);

        for body in [
            r#"{"email":null}"#,
            r#"{"email":null}"#,
            r#"{"email":"ada@example.com"}"#,
            r#"{"email":"ada@example.com"}"#,
        ] {
            let response = app
                .clone()
                .oneshot(patch_me(Some(&cookie), body))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NO_CONTENT, "{body}");
        }
        assert_eq!(email_of(&app, &cookie).await, "ada@example.com");
    }

    #[sqlx::test]
    async fn an_invalid_address_is_a_bad_request_and_changes_nothing(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let app = app(pool);
        app.clone()
            .oneshot(patch_me(Some(&cookie), r#"{"email":"ada@example.com"}"#))
            .await
            .unwrap();

        for body in [
            r#"{"email":""}"#,
            r#"{"email":"   "}"#,
            r#"{"email":"ada.example.com"}"#,
            r#"{"email":"ada@lovelace@example.com"}"#,
            r#"{"email":"@example.com"}"#,
            r#"{"email":"ada@"}"#,
            r#"{"email":"ada@example."}"#,
            r#"{"email":"ada lovelace@example.com"}"#,
            "{\"email\":\"ada\u{200b}@example.com\"}",
        ] {
            let response = app
                .clone()
                .oneshot(patch_me(Some(&cookie), body))
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{body}");
            let error = body_json(response).await["error"].clone();
            assert_eq!(error["code"], "invalid_email", "{body}");
            assert!(
                error["message"]
                    .as_str()
                    .unwrap()
                    .starts_with("Invalid email: "),
                "{body}: {error}"
            );
        }
        assert_eq!(
            email_of(&app, &cookie).await,
            "ada@example.com",
            "a refused address must not touch the stored one"
        );
    }

    /// A body without the field is not a request to clear the address.
    #[sqlx::test]
    async fn a_body_without_the_field_is_rejected(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let app = app(pool);

        for body in ["{}", r#"{"name":"Ada"}"#] {
            let response = app
                .clone()
                .oneshot(patch_me(Some(&cookie), body))
                .await
                .unwrap();

            assert_eq!(
                response.status(),
                StatusCode::UNPROCESSABLE_ENTITY,
                "{body}"
            );
            assert_eq!(body_json(response).await["error"]["code"], "invalid_body");
        }
    }

    /// The extractor runs before the body is read: no session, no answer
    /// about the body, whatever it holds.
    #[sqlx::test]
    async fn an_anonymous_request_is_401(pool: PgPool) {
        let app = app(pool);

        for body in [r#"{"email":"ada@example.com"}"#, r#"{"email":null}"#, "{}"] {
            let response = app.clone().oneshot(patch_me(None, body)).await.unwrap();

            assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{body}");
            assert_eq!(
                body_json(response).await["error"]["code"],
                "unauthenticated"
            );
        }
    }
}
