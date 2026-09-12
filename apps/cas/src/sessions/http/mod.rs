//! The session endpoints (`GET /api/me`, `POST /api/logout`), the cookie that
//! carries a session and the extractor other contexts use to require one.
//! Mounted by the transport root in `crate::http`.

pub mod cookie;
pub mod extract;
pub mod renewal;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderName, HeaderValue, StatusCode},
    routing::get,
    routing::post,
};
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::accounts::AccountType;
use crate::http::ApiState;
use crate::http::error::ApiError;
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

/// `Clear-Site-Data`, which the `http` crate has no constant for.
const CLEAR_SITE_DATA: HeaderName = HeaderName::from_static("clear-site-data");

/// What logout asks the browser to throw away. The quotation marks are part
/// of the value: the header carries a list of quoted directives.
///
/// `cache` is the point of the exercise: no cached answer about the account
/// that just signed out may be replayed by the back button. `storage` costs
/// nothing, because CAS stores nothing client-side, and covers whatever a
/// frontend on this origin may leave behind later. Both are scoped to this
/// origin. `cookies` is deliberately absent: the specification clears cookies
/// for the whole registrable domain, every sibling subdomain included, so a
/// CAS logout would sign the browser out of every other application on the
/// site and drop their preferences with it. The session cookie is removed
/// explicitly instead, by the removal cookie next to this header.
const CLEAR_SITE_DATA_ON_LOGOUT: HeaderValue = HeaderValue::from_static(r#""cache", "storage""#);

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
///
/// The removal cookie stays even though `Clear-Site-Data` asks for the
/// cookies as well: a browser that does not implement the header — and it is
/// not universal — has only the removal cookie to go on, and the two say the
/// same thing.
async fn logout(
    State(state): State<ApiState>,
    jar: CookieJar,
) -> Result<(CookieJar, [(HeaderName, HeaderValue); 1], StatusCode), ApiError> {
    if let Some(token) = jar
        .get(state.cookies.name())
        .and_then(|cookie| SessionToken::parse(cookie.value()))
    {
        state.sessions.revoke(&token).await?;
    }

    Ok((
        // `add`, not `remove`: the jar only emits a removal for a cookie the
        // request carried, and the answer must clear the cookie either way.
        jar.add(state.cookies.removal()),
        [(CLEAR_SITE_DATA, CLEAR_SITE_DATA_ON_LOGOUT)],
        StatusCode::NO_CONTENT,
    ))
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
    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{display_name, test_cookies, test_state, test_state_with_cookies};

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    /// An account with a live session; returns the token the cookie carries.
    async fn signed_in(pool: &PgPool) -> (Uuid, SessionToken) {
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();
        let issued = SessionService::new(pool.clone())
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        (account.id, issued.token)
    }

    /// The `Cookie` header a browser holding that session would send to a
    /// deployment whose cookie goes by this name.
    fn cookie(name: &str, token: &SessionToken) -> String {
        format!("{name}={}", token.expose())
    }

    /// The same header for the deployment `test_state` builds: the
    /// development origin, whose cookie has no prefix to its name.
    fn dev_cookie(token: &SessionToken) -> String {
        cookie(test_cookies().name(), token)
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
        let (account_id, token) = signed_in(&pool).await;

        let response = router(test_state(pool))
            .oneshot(get_me(Some(&dev_cookie(&token))))
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
        let name = test_cookies().name();
        let app = router(test_state(pool));
        let unknown = dev_cookie(&SessionToken::generate().unwrap());

        for cookie in [
            format!("{name}=junk"),
            format!("{name}="),
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
        let (_, token) = signed_in(&pool).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE sessions SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();

        let response = router(test_state(pool))
            .oneshot(get_me(Some(&dev_cookie(&token))))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test]
    async fn logout_ends_the_session_and_clears_the_cookie(pool: PgPool) {
        let (_, token) = signed_in(&pool).await;
        let name = test_cookies().name();
        let app = router(test_state(pool));

        let response = app
            .clone()
            .oneshot(post_logout(Some(&dev_cookie(&token))))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let set_cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .expect("logout must clear the cookie")
            .to_str()
            .unwrap();
        assert!(set_cookie.starts_with(&format!("{name}=;")), "{set_cookie}");
        assert!(set_cookie.contains("Max-Age=0"), "{set_cookie}");
        assert!(set_cookie.contains("Path=/"), "{set_cookie}");

        let after = app
            .oneshot(get_me(Some(&dev_cookie(&token))))
            .await
            .unwrap();
        assert_eq!(after.status(), StatusCode::UNAUTHORIZED);
    }

    /// On an https deployment the cookie is named `__Host-cas_session`, and
    /// the removal has to be the same cookie down to the attributes the
    /// prefix governs, or the browser keeps the one it holds.
    #[sqlx::test]
    async fn logout_on_a_secure_deployment_clears_the_prefixed_cookie(pool: PgPool) {
        let (_, token) = signed_in(&pool).await;
        let settings = CookieSettings { secure: true };
        let app = router(test_state_with_cookies(pool, settings));

        let response = app
            .clone()
            .oneshot(post_logout(Some(&cookie(settings.name(), &token))))
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
            set_cookie.starts_with("__Host-cas_session=;"),
            "{set_cookie}"
        );
        assert!(set_cookie.contains("Secure"), "{set_cookie}");
        assert!(set_cookie.contains("Path=/"), "{set_cookie}");
        assert!(!set_cookie.contains("Domain"), "{set_cookie}");
        assert_eq!(
            response
                .headers()
                .get(CLEAR_SITE_DATA)
                .expect("logout must ask the browser to drop cached data"),
            r#""cache", "storage""#,
            "cache and storage are origin-scoped; cookies would clear the whole site"
        );

        let after = app
            .oneshot(get_me(Some(&cookie(settings.name(), &token))))
            .await
            .unwrap();
        assert_eq!(after.status(), StatusCode::UNAUTHORIZED);
    }

    /// The name is part of the cookie's identity, both ways round: an https
    /// deployment ignores the bare name a sibling subdomain could have
    /// tossed at it, and the development one ignores a `__Host-` cookie it
    /// never set.
    #[sqlx::test]
    async fn a_cookie_under_the_other_deployments_name_does_not_authenticate(pool: PgPool) {
        let (_, token) = signed_in(&pool).await;
        let secure = CookieSettings { secure: true };
        let development = test_cookies();
        assert_ne!(secure.name(), development.name());

        for (settings, other) in [(secure, development), (development, secure)] {
            let app = router(test_state_with_cookies(pool.clone(), settings));

            let own = app
                .clone()
                .oneshot(get_me(Some(&cookie(settings.name(), &token))))
                .await
                .unwrap();
            assert_eq!(own.status(), StatusCode::OK, "{}", settings.name());

            let foreign = app
                .oneshot(get_me(Some(&cookie(other.name(), &token))))
                .await
                .unwrap();
            assert_eq!(
                foreign.status(),
                StatusCode::UNAUTHORIZED,
                "a {} cookie must not authenticate where the name is {}",
                other.name(),
                settings.name()
            );
        }
    }

    /// Logging out of nothing is still a logout: the cookie is cleared and
    /// nothing is refused.
    #[sqlx::test]
    async fn logout_without_a_session_is_a_no_op_that_still_clears_the_cookie(pool: PgPool) {
        let app = router(test_state(pool));
        let unknown = dev_cookie(&SessionToken::generate().unwrap());

        for cookie in [None, Some("junk=1"), Some(unknown.as_str())] {
            let response = app.clone().oneshot(post_logout(cookie)).await.unwrap();

            assert_eq!(response.status(), StatusCode::NO_CONTENT);
            assert!(response.headers().contains_key(header::SET_COOKIE));
            assert_eq!(
                response.headers().get(CLEAR_SITE_DATA),
                Some(&CLEAR_SITE_DATA_ON_LOGOUT),
                "an idempotent logout still clears the browser, cookie {cookie:?}"
            );
        }
    }
}
