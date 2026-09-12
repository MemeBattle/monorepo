//! The `Authenticated` extractor: a handler that takes one runs only for a
//! request carrying a live session cookie, and gets the session and the
//! account. Everything else is a 401 before the handler is entered.
//!
//! When authenticating renewed the session, the extractor leaves the fresh
//! cookie in the request's [`renewal`] slot for the layer to put on the
//! response; the handler never sees it.
//!
//! This is also where invalid-session activity is logged: a cookie that has
//! the shape of a token this service issued but names nothing live is a
//! browser holding a session that ended, or someone trying tokens, and
//! OWASP asks for both to be visible. Neither the cookie value nor its hash
//! is ever part of an event.

use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;

use crate::http::ApiState;
use crate::http::error::ApiError;
use crate::http::extract::original_path;
use crate::sessions::http::renewal::{self, RenewalSlot};
use crate::sessions::{Authenticated, Renewal, SessionToken};

/// One code for every way a request can fail to be authenticated — no
/// cookie, a malformed one, an unknown, expired or revoked session — so a
/// client learns nothing about which sessions exist. The fix is the same in
/// every case: sign in.
fn unauthenticated() -> ApiError {
    ApiError::unauthorized("unauthenticated", "Sign in to continue")
}

impl<S> FromRequestParts<S> for Authenticated
where
    ApiState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = ApiState::from_ref(state);
        // Reading the cookie header cannot fail; a missing or unparsable
        // header is an empty jar.
        let jar = CookieJar::from_request_parts(parts, &state)
            .await
            .unwrap_or_default();

        // No cookie is the ordinary state of a browser that has not signed
        // in, and of every request to a protected route from one: nothing
        // happened, so nothing is logged.
        let Some(cookie) = jar.get(state.cookies.name()) else {
            return Err(unauthenticated());
        };

        // A value that is not even shaped like a token is junk rather than a
        // session — a truncated cookie, another service's cookie under the
        // same name — and says nothing about this service's sessions, so it
        // is only worth a `debug`.
        let Some(token) = SessionToken::parse(cookie.value()) else {
            tracing::debug!(
                path = original_path(&parts.extensions, &parts.uri),
                "session cookie is not a well-formed token"
            );
            return Err(unauthenticated());
        };

        let Some((authenticated, renewal)) = state.sessions.authenticate(&token).await? else {
            tracing::warn!(
                path = original_path(&parts.extensions, &parts.uri),
                "session cookie names no live session"
            );
            return Err(unauthenticated());
        };

        if renewal == Renewal::Renewed
            && let Some(slot) = parts.extensions.get::<RenewalSlot>()
        {
            renewal::offer(slot, state.cookies.session(&token, &authenticated.session));
        }

        Ok(authenticated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode, header},
        routing::get,
    };
    use sqlx::PgPool;
    use tower::ServiceExt;

    use crate::accounts::{AccountRepository, NewAccount};
    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{capture_tracing, display_name, test_cookies, test_state};

    async fn whoami(authenticated: Authenticated) -> String {
        authenticated.account.id.to_string()
    }

    /// The route sits under a prefix, as every real one does under `/api`:
    /// the extractor must log the path the client sent, not the remainder
    /// the nested router hands it.
    fn app(pool: PgPool) -> Router {
        Router::new().nest(
            "/api",
            Router::new()
                .route("/whoami", get(whoami))
                .with_state(test_state(pool)),
        )
    }

    fn request(cookie: Option<&str>) -> Request<Body> {
        let mut request = Request::builder().uri("/api/whoami");
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        request.body(Body::empty()).unwrap()
    }

    /// A token that was issued and then revoked: the cookie is well formed,
    /// the session behind it is not there. That is the case OWASP asks to be
    /// able to see in the log, and the event names the route, never the
    /// cookie.
    #[sqlx::test]
    async fn a_cookie_that_names_no_live_session_is_a_warning(pool: PgPool) {
        let (events, _guard) = capture_tracing();
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let service = SessionService::new(pool.clone());
        let issued = service
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        service.revoke(&issued.token).await.unwrap();
        let cookie = format!("{}={}", test_cookies().name(), issued.token.expose());

        let response = app(pool).oneshot(request(Some(&cookie))).await.unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let [warning] = &events.mentioning("names no live session")[..] else {
            panic!("exactly one warning: {:?}", events.all());
        };
        assert!(warning.starts_with("WARN"), "{warning}");
        assert!(
            warning.contains("path=\"/api/whoami\""),
            "the path as the client sent it, prefix included: {warning}"
        );
        for event in events.all() {
            assert!(
                !event.contains(issued.token.expose()),
                "the cookie value must never be logged: {event}"
            );
        }
    }

    /// A request with no session cookie is the ordinary state of a browser
    /// that has not signed in: a 401 and not a word in the log.
    #[sqlx::test]
    async fn a_request_without_the_cookie_is_not_logged(pool: PgPool) {
        let (events, _guard) = capture_tracing();
        let app = app(pool);

        for cookie in [None, Some("other=value")] {
            let response = app.clone().oneshot(request(cookie)).await.unwrap();

            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }

        assert!(
            events.mentioning("session cookie").is_empty(),
            "{:?}",
            events.all()
        );
    }

    /// Junk in the cookie says nothing about this service's sessions, and
    /// costs no query either, so it is a `debug` rather than a warning.
    #[sqlx::test]
    async fn a_malformed_cookie_is_only_a_debug(pool: PgPool) {
        let (events, _guard) = capture_tracing();
        let app = app(pool);
        let values = ["junk", "", &"a".repeat(43)];

        for value in values {
            let response = app
                .clone()
                .oneshot(request(Some(&format!("{}={value}", test_cookies().name()))))
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{value:?}");
        }

        let malformed = events.mentioning("not a well-formed token");
        assert_eq!(malformed.len(), values.len(), "{:?}", events.all());
        assert!(malformed.iter().all(|event| event.starts_with("DEBUG")));
        assert!(
            malformed
                .iter()
                .all(|event| event.contains("path=\"/api/whoami\"")),
            "{malformed:?}"
        );
        assert!(
            events.mentioning("names no live session").is_empty(),
            "{:?}",
            events.all()
        );
    }
}
