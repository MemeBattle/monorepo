//! Re-sending the session cookie after a renewal.
//!
//! The `Authenticated` extractor (`extract`) is where a session's idle clock
//! is reset, but an extractor cannot touch the response. This layer gives
//! every request a [`RenewalSlot`]; the extractor drops the fresh cookie into
//! it, and the layer adds it to the response on the way out. A handler that
//! sets the cookie itself wins: the layer never adds a second `Set-Cookie`.

use std::sync::{Arc, OnceLock};

use axum::{
    Router,
    extract::Request,
    http::header,
    middleware::{self, Next},
    response::Response,
};
use axum_extra::extract::cookie::Cookie;

/// One per request, shared between the layer and the extractor through the
/// request extensions. Written at most once: a request authenticates once.
#[derive(Debug, Clone, Default)]
pub struct RenewalSlot(Arc<OnceLock<Cookie<'static>>>);

/// Leaves the cookie for the layer. A second offer on the same request is
/// ignored; the first renewal is the one that happened.
pub(super) fn offer(slot: &RenewalSlot, cookie: Cookie<'static>) {
    let _ = slot.0.set(cookie);
}

/// Wraps a router so that a request whose session was renewed answers with
/// the fresh cookie. Applied by the transport root to everything under
/// `/api`: any handler there may take `Authenticated`.
pub fn with_cookie_renewal(router: Router) -> Router {
    router.layer(middleware::from_fn(renew_cookie))
}

async fn renew_cookie(mut request: Request, next: Next) -> Response {
    let slot = RenewalSlot::default();
    request.extensions_mut().insert(slot.clone());

    let mut response = next.run(request).await;

    if let Some(cookie) = slot.0.get()
        && !response.headers().contains_key(header::SET_COOKIE)
        && let Ok(value) = cookie.encoded().to_string().parse()
    {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        routing::{get, post},
    };
    use axum_extra::extract::CookieJar;
    use sqlx::PgPool;
    use tower::ServiceExt;
    use uuid::Uuid;

    use crate::accounts::{AccountRepository, NewAccount};
    use crate::http::ApiState;
    use crate::sessions::http::cookie::SESSION_COOKIE;
    use crate::sessions::{
        Authenticated, SESSION_IDLE_TIMEOUT, SessionOrigin, SessionService, as_time,
    };
    use crate::testing::{display_name, test_state};

    async fn signed_in(pool: &PgPool) -> (Uuid, String) {
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let issued = SessionService::new(pool.clone())
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        (
            issued.session.id,
            format!("{SESSION_COOKIE}={}", issued.token.expose()),
        )
    }

    /// Moves a session's last use into the past by the given interval.
    /// Unchecked query: see docs/TESTS.md.
    async fn last_seen(pool: &PgPool, id: Uuid, ago: &str) {
        sqlx::query("UPDATE sessions SET last_seen_at = now() - $2::interval WHERE id = $1")
            .bind(id)
            .bind(ago)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn whoami(authenticated: Authenticated) -> String {
        authenticated.account.id.to_string()
    }

    /// A handler that takes the session and also clears the cookie: what a
    /// future "sign out everywhere" would do.
    async fn sign_out(_authenticated: Authenticated, jar: CookieJar) -> (CookieJar, StatusCode) {
        (
            jar.add(Cookie::build((SESSION_COOKIE, "")).path("/").build()),
            StatusCode::NO_CONTENT,
        )
    }

    fn app(state: ApiState) -> Router {
        with_cookie_renewal(
            Router::new()
                .route("/whoami", get(whoami))
                .route("/sign-out", post(sign_out))
                .with_state(state),
        )
    }

    fn request(method: &str, uri: &str, cookie: &str) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header(header::COOKIE, cookie)
            .body(Body::empty())
            .unwrap()
    }

    #[sqlx::test]
    async fn a_request_inside_the_window_gets_no_cookie(pool: PgPool) {
        let (_, cookie) = signed_in(&pool).await;

        let response = app(test_state(pool))
            .oneshot(request("GET", "/whoami", &cookie))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
    }

    /// The renewed session comes back to the browser with its `Max-Age`
    /// pushed out to the idle timeout again, same token, same attributes.
    #[sqlx::test]
    async fn a_renewing_request_re_sends_the_cookie(pool: PgPool) {
        let (id, cookie) = signed_in(&pool).await;
        last_seen(&pool, id, "2 hours").await;

        let response = app(test_state(pool))
            .oneshot(request("GET", "/whoami", &cookie))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let set_cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .expect("a renewal re-sends the cookie")
            .to_str()
            .unwrap();
        let sent = Cookie::parse(set_cookie).unwrap();
        assert_eq!(format!("{SESSION_COOKIE}={}", sent.value()), cookie);
        assert_eq!(sent.http_only(), Some(true));
        assert_eq!(sent.path(), Some("/"));
        let max_age = sent.max_age().unwrap();
        let idle = as_time(SESSION_IDLE_TIMEOUT);
        assert!(max_age <= idle && max_age > idle - time::Duration::seconds(5));
    }

    /// The handler's own `Set-Cookie` is the answer; the renewal cookie does
    /// not compete with it.
    #[sqlx::test]
    async fn a_handler_that_sets_the_cookie_wins(pool: PgPool) {
        let (id, cookie) = signed_in(&pool).await;
        last_seen(&pool, id, "2 hours").await;

        let response = app(test_state(pool))
            .oneshot(request("POST", "/sign-out", &cookie))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let set_cookies: Vec<_> = response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .collect();
        assert_eq!(set_cookies.len(), 1);
        assert!(
            set_cookies[0]
                .to_str()
                .unwrap()
                .starts_with(&format!("{SESSION_COOKIE}=;")),
            "{:?}",
            set_cookies[0]
        );
    }

    #[sqlx::test]
    async fn an_unauthenticated_request_gets_no_cookie(pool: PgPool) {
        let response = app(test_state(pool))
            .oneshot(request("GET", "/whoami", "other=1"))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
    }
}
