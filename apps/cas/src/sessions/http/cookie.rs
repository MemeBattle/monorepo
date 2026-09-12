//! The session cookie: the one place its name and attributes are decided.

use axum_extra::extract::cookie::{Cookie, SameSite};
use webauthn_rs::prelude::Url;

use crate::sessions::{SESSION_LIFETIME, SessionToken};

/// The cookie's name. The `cas_` prefix keeps it apart from anything another
/// app on the same site might set.
pub const SESSION_COOKIE: &str = "cas_session";

/// What varies between deployments. Decided once at startup from the
/// configuration and carried in the API state.
#[derive(Debug, Clone, Copy)]
pub struct CookieSettings {
    /// `Secure` is set whenever the relying party origin is https. It is left
    /// off for the plain-http development origin, because Safari does not
    /// accept a `Secure` cookie over http even from localhost.
    pub secure: bool,
}

impl CookieSettings {
    pub fn for_origin(origin: &Url) -> Self {
        Self {
            secure: origin.scheme() == "https",
        }
    }

    /// The cookie that carries a freshly issued session.
    ///
    /// `HttpOnly`: script never reads it. `SameSite=Lax`: sent on top-level
    /// navigations (the future OIDC `/authorize` redirect must carry it) but
    /// not on cross-site POSTs, which is the CSRF line. `Path=/`: one cookie
    /// for the whole service. `Max-Age`: the same lifetime the row has.
    pub fn session(&self, token: &SessionToken) -> Cookie<'static> {
        let mut cookie = self.base(token.expose().to_owned());
        cookie.set_max_age(
            time::Duration::try_from(SESSION_LIFETIME)
                .expect("the session lifetime fits in a cookie max-age"),
        );
        cookie
    }

    /// The cookie that removes the session cookie: same name, path and
    /// flags, `Max-Age=0`. The attributes must match for the browser to
    /// treat it as the same cookie.
    pub fn removal(&self) -> Cookie<'static> {
        let mut cookie = self.base(String::new());
        cookie.set_max_age(time::Duration::ZERO);
        cookie
    }

    fn base(&self, value: String) -> Cookie<'static> {
        Cookie::build((SESSION_COOKIE, value))
            .http_only(true)
            .secure(self.secure)
            .same_site(SameSite::Lax)
            .path("/")
            .build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin(value: &str) -> Url {
        value.parse().unwrap()
    }

    #[test]
    fn secure_follows_the_origin_scheme() {
        assert!(CookieSettings::for_origin(&origin("https://cas.example.com")).secure);
        assert!(!CookieSettings::for_origin(&origin("http://localhost:5173")).secure);
    }

    #[test]
    fn the_session_cookie_is_locked_down() {
        let token = SessionToken::generate().unwrap();
        let settings = CookieSettings { secure: true };

        let cookie = settings.session(&token);

        assert_eq!(cookie.name(), SESSION_COOKIE);
        assert_eq!(cookie.value(), token.expose());
        assert_eq!(cookie.http_only(), Some(true));
        assert_eq!(cookie.secure(), Some(true));
        assert_eq!(cookie.same_site(), Some(SameSite::Lax));
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.domain(), None, "host-only");
        assert_eq!(
            cookie.max_age(),
            Some(time::Duration::try_from(SESSION_LIFETIME).unwrap())
        );
    }

    #[test]
    fn the_removal_cookie_matches_the_session_cookie_and_expires_at_once() {
        let settings = CookieSettings { secure: false };

        let cookie = settings.removal();

        assert_eq!(cookie.name(), SESSION_COOKIE);
        assert_eq!(cookie.value(), "");
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.http_only(), Some(true));
        assert_eq!(cookie.secure(), Some(false));
        assert_eq!(cookie.max_age(), Some(time::Duration::ZERO));
    }
}
