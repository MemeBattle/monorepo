//! The `Authenticated` extractor: a handler that takes one runs only for a
//! request carrying a live session cookie, and gets the session and the
//! account. Everything else is a 401 before the handler is entered.
//!
//! When authenticating renewed the session, the extractor leaves the fresh
//! cookie in the request's [`renewal`] slot for the layer to put on the
//! response; the handler never sees it.

use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;

use crate::http::ApiState;
use crate::http::error::ApiError;
use crate::sessions::http::cookie::SESSION_COOKIE;
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

        let token = jar
            .get(SESSION_COOKIE)
            .and_then(|cookie| SessionToken::parse(cookie.value()))
            .ok_or_else(unauthenticated)?;

        let (authenticated, renewal) = state
            .sessions
            .authenticate(&token)
            .await?
            .ok_or_else(unauthenticated)?;

        if renewal == Renewal::Renewed
            && let Some(slot) = parts.extensions.get::<RenewalSlot>()
        {
            renewal::offer(slot, state.cookies.session(&token, &authenticated.session));
        }

        Ok(authenticated)
    }
}
