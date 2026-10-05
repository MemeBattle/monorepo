//! The session endpoints (`GET /api/me`, `POST /api/logout`), the cookie that
//! carries a session and the extractor other contexts use to require one.
//! Mounted by the transport root in `crate::http`. `PATCH /api/me`, the
//! write half of the resource, is the accounts context's
//! (`crate::accounts::http`), merged at the same path (ADR 0007).

pub mod cookie;
pub mod extract;
pub mod renewal;

use std::collections::BTreeMap;

use axum::{
    extract::State,
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use utoipa::openapi::{RefOr, response::Response as OpenApiResponse};
use utoipa::{OpenApi, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use crate::accounts::AccountType;
use crate::http::ApiState;
use crate::http::error::ApiErrors;
use crate::http::extract::Json;
use crate::http::response::{on_success, string_header};
use crate::sessions::http::extract::AnySession;
use crate::sessions::service::CreateError;
use crate::sessions::{Authenticated, SessionToken};

pub use cookie::CookieSettings;
pub use renewal::with_cookie_renewal;

// Registration and login create sessions from their own handlers; the
// mapping lives here, with the context that owns the error.
crate::api_errors! { CreateError {
    // The OS refusing to provide randomness is nothing this code can name a
    // remedy for.
    Random(_) => internal,
    Db(_) => from,
} }

/// A response that signs the browser in: `R` with the session cookie the
/// jar carries. Registration and login answer with it; described as `R`
/// with a `Set-Cookie` header on its success.
pub struct WithSessionCookie<R>(pub CookieJar, pub R);

impl<R: IntoResponse> IntoResponse for WithSessionCookie<R> {
    fn into_response(self) -> Response {
        (self.0, self.1).into_response()
    }
}

impl<R: utoipa::IntoResponses> utoipa::IntoResponses for WithSessionCookie<R> {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        on_success(R::responses(), "Set-Cookie", session_cookie_header())
    }
}

fn session_cookie_header() -> utoipa::openapi::header::Header {
    string_header(
        "The session cookie (`cas_session`, `__Host-cas_session` on an https origin): \
         HttpOnly, SameSite=Lax, Path=/.",
    )
}

/// Logout's answer: `204`, the removal cookie in the jar, and
/// `Clear-Site-Data`.
pub struct LoggedOut(CookieJar);

impl IntoResponse for LoggedOut {
    fn into_response(self) -> Response {
        (
            self.0,
            [(CLEAR_SITE_DATA, CLEAR_SITE_DATA_ON_LOGOUT)],
            StatusCode::NO_CONTENT,
        )
            .into_response()
    }
}

impl utoipa::IntoResponses for LoggedOut {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        let response = utoipa::openapi::ResponseBuilder::new()
            .description("Signed out; the cookie is cleared whether or not a session was ended.")
            .header(
                "Set-Cookie",
                string_header("The removal of the session cookie (`Max-Age=0`)."),
            )
            .header("Clear-Site-Data", string_header(r#"`"cache", "storage"`"#))
            .build();
        BTreeMap::from([(
            StatusCode::NO_CONTENT.as_str().to_owned(),
            RefOr::T(response),
        )])
    }
}

/// `Clear-Site-Data`, which the `http` crate has no constant for.
pub(crate) const CLEAR_SITE_DATA: HeaderName = HeaderName::from_static("clear-site-data");

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
///
/// RP-initiated logout (`/oidc/end_session`, ADR 0013 (i)) sends the same value
/// when it ends a session.
pub(crate) const CLEAR_SITE_DATA_ON_LOGOUT: HeaderValue =
    HeaderValue::from_static(r#""cache", "storage""#);

/// The response bodies of the context's endpoints, for the description.
#[derive(OpenApi)]
#[openapi(components(schemas(MeResponse)))]
struct SessionsApi;

pub fn router(state: ApiState) -> OpenApiRouter {
    OpenApiRouter::with_openapi(SessionsApi::openapi())
        .routes(routes!(me))
        .routes(routes!(logout))
        .with_state(state)
}

/// The signed-in account as the dashboard needs it. Nothing about the
/// session itself but when it ends if left alone: the id is server-side
/// state.
///
/// Under an upgrade session it is the guest (ADR 0018): `accountType:
/// "guest"`, the generated `Guest <n>` name, `email: null`, and the upgrade
/// session's expiry. A resolved session of a guest is always an upgrade
/// session, so the type is all the frontend needs to tell the two apart.
#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    account_id: Uuid,
    display_name: String,
    account_type: AccountType,
    /// `null` when the account has no address.
    #[schema(required)]
    email: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    session_expires_at: OffsetDateTime,
}

crate::error_set!(MeErrors: AnySession);

/// The signed-in account.
///
/// Answers an upgrade session too, with the guest it belongs to
/// (`accountType: "guest"`): the one read open to it, so the frontend can
/// tell a guest from a signed-out browser (ADR 0018).
#[utoipa::path(
    get,
    path = "/me",
    operation_id = "get_me",
    security(("session" = []))
)]
async fn me(
    AnySession(authenticated): AnySession,
) -> Result<Json<MeResponse>, ApiErrors<MeErrors>> {
    let Authenticated { session, account } = authenticated;

    Ok(Json(MeResponse {
        account_id: account.id,
        display_name: account.display_name.into_inner(),
        account_type: account.r#type,
        email: account.email,
        session_expires_at: session.valid_until(),
    }))
}

crate::error_set!(LogoutErrors: sqlx::Error);

/// Ends the session the cookie names and clears the cookie. Idempotent and
/// never a 401: a browser holding an expired or already revoked cookie is
/// asking to forget it, and the answer to that is yes.
///
/// The removal cookie stays even though `Clear-Site-Data` asks for the
/// cookies as well: a browser that does not implement the header — and it is
/// not universal — has only the removal cookie to go on, and the two say the
/// same thing.
#[utoipa::path(post, path = "/logout")]
async fn logout(
    State(state): State<ApiState>,
    headers: HeaderMap,
    jar: CookieJar,
) -> Result<LoggedOut, ApiErrors<LogoutErrors>> {
    // The name is matched on the wire, undecoded, as the extractor does
    // (see `CookieSettings::presented`); the jar only carries the answer.
    if let Some(token) = state
        .cookies
        .presented(&headers)
        .and_then(|value| SessionToken::parse(&value))
    {
        state.sessions.revoke(&token).await?;
    }

    // `add`, not `remove`: the jar only emits a removal for a cookie the
    // request carried, and the answer must clear the cookie either way.
    Ok(LoggedOut(jar.add(state.cookies.removal())))
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
    use crate::testing::{
        checked, display_name, test_cookies, test_state, test_state_with_cookies,
    };

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

    /// The wrapper answers what `(CookieJar, Json<_>)` answered: the
    /// cookie, the status and the body of the inner response.
    #[tokio::test]
    async fn with_session_cookie_is_the_jar_and_the_response() {
        let jar = CookieJar::new().add(axum_extra::extract::cookie::Cookie::new("name", "value"));

        let response = WithSessionCookie(jar, Json(serde_json::json!({"a": 1}))).into_response();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::SET_COOKIE).unwrap(),
            "name=value"
        );
        assert_eq!(body_json(response).await, serde_json::json!({"a": 1}));
    }

    /// What the logout tuple answered: `204`, the jar's cookie and
    /// `Clear-Site-Data`, no body.
    #[tokio::test]
    async fn logged_out_is_a_204_with_the_cookie_and_clear_site_data() {
        let jar = CookieJar::new().add(test_cookies().removal());

        let response = LoggedOut(jar).into_response();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert!(response.headers().contains_key(header::SET_COOKIE));
        assert_eq!(
            response.headers().get(CLEAR_SITE_DATA),
            Some(&CLEAR_SITE_DATA_ON_LOGOUT)
        );
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(bytes.is_empty());
    }

    #[sqlx::test]
    async fn me_returns_the_signed_in_account(pool: PgPool) {
        let (account_id, token) = signed_in(&pool).await;

        let response = checked(router(test_state(pool)))
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
        let response = checked(router(test_state(pool)))
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
        let app = checked(router(test_state(pool)));
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

        let response = checked(router(test_state(pool)))
            .oneshot(get_me(Some(&dev_cookie(&token))))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test]
    async fn logout_ends_the_session_and_clears_the_cookie(pool: PgPool) {
        let (_, token) = signed_in(&pool).await;
        let name = test_cookies().name();
        let app = checked(router(test_state(pool)));

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
        let app = checked(router(test_state_with_cookies(pool, settings)));

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
            let app = checked(router(test_state_with_cookies(pool.clone(), settings)));

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

    /// The name on the wire is the name. A browser holds a cookie named
    /// `%5F%5FHost-cas_session` to no `__Host-` rule, so a sibling subdomain
    /// could toss one domain-wide with the attacker's own valid token in it;
    /// a lookup that decoded the name would sign the victim into that
    /// session. Neither `/me` nor logout may see the alias as the cookie.
    #[sqlx::test]
    async fn a_percent_encoded_alias_of_the_cookie_name_is_not_the_cookie(pool: PgPool) {
        let (_, token) = signed_in(&pool).await;
        let secure = CookieSettings { secure: true };
        let development = test_cookies();

        for (settings, alias) in [
            (secure, "%5F%5FHost-cas_session"),
            (secure, "__Host-cas%5Fsession"),
            (development, "cas%5Fsession"),
        ] {
            let app = checked(router(test_state_with_cookies(pool.clone(), settings)));

            let me = app
                .clone()
                .oneshot(get_me(Some(&cookie(alias, &token))))
                .await
                .unwrap();
            assert_eq!(me.status(), StatusCode::UNAUTHORIZED, "{alias}");

            let logout = app
                .clone()
                .oneshot(post_logout(Some(&cookie(alias, &token))))
                .await
                .unwrap();
            assert_eq!(logout.status(), StatusCode::NO_CONTENT, "{alias}");
            let still_there = app
                .oneshot(get_me(Some(&cookie(settings.name(), &token))))
                .await
                .unwrap();
            assert_eq!(
                still_there.status(),
                StatusCode::OK,
                "a logout under the alias {alias} must not end the real session"
            );
        }
    }

    /// A guest holding an upgrade session, as `/oidc/authorize` opens one.
    async fn upgrade_session(pool: &PgPool) -> SessionToken {
        let client = crate::testing::register_public_client(pool, "ligretto", &[]).await;
        let guest = AccountRepository::new(pool.clone())
            .create(NewAccount::guest(client.id, 1))
            .await
            .unwrap();
        SessionService::new(pool.clone())
            .open_upgrade(guest.id)
            .await
            .unwrap()
            .token
    }

    /// `/me` answers an upgrade session with the guest it belongs to
    /// (ADR 0018): the type, the generated name, no email, and the upgrade
    /// session's expiry, at most an hour away.
    #[sqlx::test]
    async fn me_under_an_upgrade_session_answers_the_guest(pool: PgPool) {
        let upgrade = crate::testing::upgrade_signed_in(&pool).await;

        let response = checked(router(test_state(pool)))
            .oneshot(get_me(Some(&upgrade.cookie)))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = body_json(response).await;
        assert_eq!(body["accountId"], upgrade.account.id.to_string());
        assert_eq!(body["accountType"], "guest");
        assert_eq!(body["displayName"], "Guest 1");
        assert_eq!(body["email"], serde_json::Value::Null);
        let expires_at = OffsetDateTime::parse(
            body["sessionExpiresAt"].as_str().unwrap(),
            &time::format_description::well_known::Rfc3339,
        )
        .unwrap();
        let lifetime = expires_at - OffsetDateTime::now_utc();
        assert!(
            lifetime > time::Duration::ZERO
                && lifetime
                    <= time::Duration::try_from(crate::sessions::UPGRADE_SESSION_LIFETIME).unwrap(),
            "the upgrade session's expiry, within its hour: {lifetime}"
        );
    }

    /// Once the account is full, the upgrade session that read `/me` reads
    /// nothing: the read never describes a full account (ADR 0015 (b)).
    #[sqlx::test]
    async fn me_under_an_upgrade_session_of_a_full_account_is_401(pool: PgPool) {
        let upgrade = crate::testing::upgrade_signed_in(&pool).await;
        let app = checked(router(test_state(pool.clone())));
        let before = app
            .clone()
            .oneshot(get_me(Some(&upgrade.cookie)))
            .await
            .unwrap();
        assert_eq!(before.status(), StatusCode::OK);

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE accounts SET type = 'full' WHERE id = $1")
            .bind(upgrade.account.id)
            .execute(&pool)
            .await
            .unwrap();

        let response = app.oneshot(get_me(Some(&upgrade.cookie))).await.unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "unauthenticated"
        );
    }

    /// Ending a session is not a use of it: logout ends an upgrade session
    /// like any other.
    #[sqlx::test]
    async fn logout_ends_an_upgrade_session(pool: PgPool) {
        let token = upgrade_session(&pool).await;

        let response = checked(router(test_state(pool.clone())))
            .oneshot(post_logout(Some(&dev_cookie(&token))))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        // Unchecked query: see docs/TESTS.md.
        let left: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left, 0);
    }

    /// Logging out of nothing is still a logout: the cookie is cleared and
    /// nothing is refused.
    #[sqlx::test]
    async fn logout_without_a_session_is_a_no_op_that_still_clears_the_cookie(pool: PgPool) {
        let app = checked(router(test_state(pool)));
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
