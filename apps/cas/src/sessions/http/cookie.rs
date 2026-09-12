//! The session cookie: the one place its name and attributes are decided.

use axum_extra::extract::cookie::{Cookie, SameSite};
use time::OffsetDateTime;
use webauthn_rs::prelude::Url;

use crate::sessions::{Session, SessionToken};

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

    /// The cookie that carries a session: sent when it is issued and again
    /// each time it is renewed.
    ///
    /// `HttpOnly`: script never reads it. `SameSite=Lax`: sent on top-level
    /// navigations (the future OIDC `/authorize` redirect must carry it) but
    /// not on cross-site POSTs, which is the CSRF line. `Path=/`: one cookie
    /// for the whole service. `Max-Age`: until the session stops being
    /// honoured if nothing renews it, so the browser and the server give up
    /// together; a renewal re-sends the cookie with the clock pushed out.
    pub fn session(&self, token: &SessionToken, session: &Session) -> Cookie<'static> {
        let mut cookie = self.base(token.expose().to_owned());
        cookie.set_max_age(
            (session.valid_until() - OffsetDateTime::now_utc()).max(time::Duration::ZERO),
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
    use crate::sessions::{SESSION_IDLE_TIMEOUT, SESSION_LIFETIME, as_time};
    use uuid::Uuid;

    fn origin(value: &str) -> Url {
        value.parse().unwrap()
    }

    #[test]
    fn secure_follows_the_origin_scheme() {
        assert!(CookieSettings::for_origin(&origin("https://cas.example.com")).secure);
        assert!(!CookieSettings::for_origin(&origin("http://localhost:5173")).secure);
    }

    /// A session as `create` would return it right now.
    fn fresh_session() -> Session {
        let now = OffsetDateTime::now_utc();
        Session {
            id: Uuid::new_v4(),
            account_id: Uuid::new_v4(),
            created_at: now,
            expires_at: now + as_time(SESSION_LIFETIME),
            last_seen_at: now,
        }
    }

    #[test]
    fn the_session_cookie_is_locked_down() {
        let token = SessionToken::generate().unwrap();
        let settings = CookieSettings { secure: true };

        let cookie = settings.session(&token, &fresh_session());

        assert_eq!(cookie.name(), SESSION_COOKIE);
        assert_eq!(cookie.value(), token.expose());
        assert_eq!(cookie.http_only(), Some(true));
        assert_eq!(cookie.secure(), Some(true));
        assert_eq!(cookie.same_site(), Some(SameSite::Lax));
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.domain(), None, "host-only");
    }

    /// The browser drops the cookie when the server would stop honouring the
    /// session: the idle timeout for a fresh session, the cap when that is
    /// nearer, never less than nothing.
    #[test]
    fn max_age_follows_the_session_clocks() {
        let token = SessionToken::generate().unwrap();
        let settings = CookieSettings { secure: true };
        let idle = as_time(SESSION_IDLE_TIMEOUT);
        let slack = time::Duration::seconds(5);

        let fresh = settings
            .session(&token, &fresh_session())
            .max_age()
            .unwrap();
        assert!(fresh <= idle && fresh > idle - slack, "{fresh}");

        let mut near_the_cap = fresh_session();
        near_the_cap.expires_at = near_the_cap.last_seen_at + time::Duration::days(1);
        let capped = settings.session(&token, &near_the_cap).max_age().unwrap();
        assert!(capped <= time::Duration::days(1) && capped > time::Duration::days(1) - slack);

        let mut over = fresh_session();
        over.expires_at = over.last_seen_at - time::Duration::seconds(1);
        assert_eq!(
            settings.session(&token, &over).max_age(),
            Some(time::Duration::ZERO)
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
