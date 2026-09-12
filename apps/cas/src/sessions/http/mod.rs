//! The session endpoints (`GET /api/me`, `POST /api/logout`), the cookie that
//! carries a session and the extractor other contexts use to require one.
//! Mounted by the transport root in `crate::http`.

pub mod cookie;
pub mod extract;
pub mod renewal;

use axum::{Json, Router, extract::State, http::StatusCode, routing::get, routing::post};
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::accounts::AccountType;
use crate::http::ApiState;
use crate::http::error::ApiError;
use crate::sessions::http::cookie::SESSION_COOKIE;
use crate::sessions::service::CreateError;
use crate::sessions::{Authenticated, SessionToken};

pub use cookie::CookieSettings;
pub use renewal::with_cookie_renewal;

/// Registration and login create sessions from their own handlers; the
/// mapping lives here, with the context that owns the error.
impl From<CreateError> for ApiError {
    fn from(error: CreateError) -> Self {
        match error {
            // The OS refusing to provide randomness is nothing this code can
            // name a remedy for.
            CreateError::Random(error) => ApiError::internal(error),
            CreateError::Db(error) => ApiError::from(error),
        }
    }
}

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/me", get(me))
        .route("/logout", post(logout))
        .with_state(state)
}

/// The signed-in account as the dashboard needs it. Nothing about the
/// session itself but when it ends if left alone: the id is server-side
/// state.
#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    account_id: Uuid,
    display_name: String,
    account_type: AccountType,
    email: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    session_expires_at: OffsetDateTime,
}

async fn me(authenticated: Authenticated) -> Json<MeResponse> {
    let Authenticated { session, account } = authenticated;

    Json(MeResponse {
        account_id: account.id,
        display_name: account.display_name.into_inner(),
        account_type: account.r#type,
        email: account.email,
        session_expires_at: session.valid_until(),
    })
}

/// Ends the session the cookie names and clears the cookie. Idempotent and
/// never a 401: a browser holding an expired or already revoked cookie is
/// asking to forget it, and the answer to that is yes.
async fn logout(
    State(state): State<ApiState>,
    jar: CookieJar,
) -> Result<(CookieJar, StatusCode), ApiError> {
    if let Some(token) = jar
        .get(SESSION_COOKIE)
        .and_then(|cookie| SessionToken::parse(cookie.value()))
    {
        state.sessions.revoke(&token).await?;
    }

    // `add`, not `remove`: the jar only emits a removal for a cookie the
    // request carried, and the answer must clear the cookie either way.
    Ok((jar.add(state.cookies.removal()), StatusCode::NO_CONTENT))
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
    use crate::sessions::SessionService;
    use crate::testing::{display_name, test_state};

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    /// An account with a live session; returns the cookie header value.
    async fn signed_in(pool: &PgPool) -> (Uuid, String) {
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();
        let issued = SessionService::new(pool.clone())
            .create(account.id)
            .await
            .unwrap();
        (
            account.id,
            format!("{SESSION_COOKIE}={}", issued.token.expose()),
        )
    }

    fn get_me(cookie: Option<&str>) -> Request<Body> {
        let mut request = Request::builder().method("GET").uri("/me");
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        request.body(Body::empty()).unwrap()
    }

    fn post_logout(cookie: Option<&str>) -> Request<Body> {
        let mut request = Request::builder().method("POST").uri("/logout");
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        request.body(Body::empty()).unwrap()
    }

    #[sqlx::test]
    async fn me_returns_the_signed_in_account(pool: PgPool) {
        let (account_id, cookie) = signed_in(&pool).await;

        let response = router(test_state(pool))
            .oneshot(get_me(Some(&cookie)))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_json(response).await;
        assert_eq!(body["accountId"], account_id.to_string());
        assert_eq!(body["displayName"], "Ada");
        assert_eq!(body["accountType"], "full");
        assert_eq!(body["email"], "ada@example.com");
        assert!(body["sessionExpiresAt"].is_string());
        assert!(body.get("sessionId").is_none());
    }

    #[sqlx::test]
    async fn me_without_a_cookie_is_401(pool: PgPool) {
        let response = router(test_state(pool))
            .oneshot(get_me(None))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "unauthenticated"
        );
    }

    #[sqlx::test]
    async fn me_with_a_malformed_or_unknown_cookie_is_401(pool: PgPool) {
        let app = router(test_state(pool));
        let unknown = format!(
            "{SESSION_COOKIE}={}",
            SessionToken::generate().unwrap().expose()
        );

        for cookie in [
            format!("{SESSION_COOKIE}=junk"),
            format!("{SESSION_COOKIE}="),
            "other=value".to_owned(),
            unknown,
        ] {
            let response = app.clone().oneshot(get_me(Some(&cookie))).await.unwrap();

            assert_eq!(
                response.status(),
                StatusCode::UNAUTHORIZED,
                "cookie {cookie:?} must not authenticate"
            );
            assert_eq!(
                body_json(response).await["error"]["code"],
                "unauthenticated"
            );
        }
    }

    /// Expiry is the server's call: the browser may still hold the cookie,
    /// the row past its time no longer answers.
    #[sqlx::test]
    async fn me_with_an_expired_session_is_401(pool: PgPool) {
        let (_, cookie) = signed_in(&pool).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE sessions SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();

        let response = router(test_state(pool))
            .oneshot(get_me(Some(&cookie)))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test]
    async fn logout_ends_the_session_and_clears_the_cookie(pool: PgPool) {
        let (_, cookie) = signed_in(&pool).await;
        let app = router(test_state(pool));

        let response = app
            .clone()
            .oneshot(post_logout(Some(&cookie)))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let set_cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .expect("logout must clear the cookie")
            .to_str()
            .unwrap();
        assert!(
            set_cookie.starts_with(&format!("{SESSION_COOKIE}=;")),
            "{set_cookie}"
        );
        assert!(set_cookie.contains("Max-Age=0"), "{set_cookie}");
        assert!(set_cookie.contains("Path=/"), "{set_cookie}");

        let after = app.oneshot(get_me(Some(&cookie))).await.unwrap();
        assert_eq!(after.status(), StatusCode::UNAUTHORIZED);
    }

    /// Logging out of nothing is still a logout: the cookie is cleared and
    /// nothing is refused.
    #[sqlx::test]
    async fn logout_without_a_session_is_a_no_op_that_still_clears_the_cookie(pool: PgPool) {
        let app = router(test_state(pool));
        let unknown = format!(
            "{SESSION_COOKIE}={}",
            SessionToken::generate().unwrap().expose()
        );

        for cookie in [None, Some("junk=1"), Some(unknown.as_str())] {
            let response = app.clone().oneshot(post_logout(cookie)).await.unwrap();

            assert_eq!(response.status(), StatusCode::NO_CONTENT);
            assert!(response.headers().contains_key(header::SET_COOKIE));
        }
    }
}
