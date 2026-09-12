//! The session cookie: the one place its name and attributes are decided.

use axum::http::{HeaderMap, header};
use axum_extra::extract::cookie::{Cookie, SameSite};
use time::OffsetDateTime;
use webauthn_rs::prelude::Url;

use crate::sessions::{Session, SessionToken};

/// The name itself, as a macro so that the prefixed spelling below is this
/// same literal with the prefix glued on while compiling: a name is borrowed
/// for the life of the process and cannot be joined at runtime.
macro_rules! base_name {
    () => {
        "cas_session"
    };
}

/// The name where there is no `Secure` to carry a prefix. The `cas_` part
/// keeps it apart from anything another app on the same site might set.
const BASE_NAME: &str = base_name!();

/// The name OWASP asks for. A browser accepts a cookie whose name starts
/// with `__Host-` only when the cookie is `Secure`, carries no `Domain` and
/// has `Path=/` — and it holds everyone setting that name to the same rule,
/// which is what closes cookie tossing: a compromised sibling subdomain can
/// write a cookie for the parent domain, but not one under this name.
const PREFIXED_NAME: &str = concat!("__Host-", base_name!());

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

    /// The name the cookie goes out under, and therefore the name every
    /// reader of it looks for: the extractor, logout, and the removal cookie
    /// that must match the one the browser holds.
    ///
    /// The prefix rides on `Secure`, so the name has to follow the setting.
    /// A deployment without `Secure` — the plain-http development origin,
    /// because Safari refuses a `Secure` cookie over http even from
    /// localhost — would have its `__Host-` cookie dropped by the browser on
    /// the way in, so it uses the bare name and does without the guarantee.
    pub fn name(&self) -> &'static str {
        if self.secure {
            PREFIXED_NAME
        } else {
            BASE_NAME
        }
    }

    /// The value the request presents under the session cookie's name, or
    /// `None` when it presents nothing under that name. Read straight from
    /// the `Cookie` header(s) with the name compared byte for byte, without
    /// percent-decoding.
    ///
    /// The decoding jar (`axum_extra::extract::CookieJar`) is not used here
    /// on purpose. It percent-decodes names, so `%5F%5FHost-cas_session`
    /// would be read as `__Host-cas_session`, while a browser keeps names as
    /// written (RFC 6265bis §5.6) and applies the `__Host-` rules only to a
    /// name that literally starts with the prefix. A sibling subdomain could
    /// therefore set a domain-wide cookie under the encoded spelling, which
    /// the browser would accept and send here, and a decoding lookup would
    /// take it for the real one: cookie tossing through the back door the
    /// prefix is meant to close. Matching the wire name shuts it.
    pub fn presented(&self, headers: &HeaderMap) -> Option<String> {
        headers
            .get_all(header::COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .flat_map(Cookie::split_parse)
            .filter_map(Result::ok)
            .find(|cookie| cookie.name() == self.name())
            .map(|cookie| cookie.value().to_owned())
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
        Cookie::build((self.name(), value))
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

    fn headers(cookies: &[&str]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for cookie in cookies {
            headers.append(header::COOKIE, cookie.parse().unwrap());
        }
        headers
    }

    #[test]
    fn presented_finds_the_cookie_by_its_exact_name() {
        let settings = CookieSettings { secure: true };

        assert_eq!(
            settings.presented(&headers(&["other=1; __Host-cas_session=tok; more=2"])),
            Some("tok".to_owned())
        );
        // Across several `Cookie` headers, which HTTP/2 clients send.
        assert_eq!(
            settings.presented(&headers(&["other=1", "__Host-cas_session=tok"])),
            Some("tok".to_owned())
        );
        assert_eq!(settings.presented(&headers(&["cas_session=tok"])), None);
        assert_eq!(settings.presented(&headers(&[])), None);
    }

    /// A percent-encoded spelling of the name is another name. A browser
    /// never decodes it, so it would not hold it to the `__Host-` rules, and
    /// a sibling subdomain could toss a domain cookie under it; the lookup
    /// must not decode it either.
    #[test]
    fn presented_does_not_decode_an_encoded_alias_of_the_name() {
        let secure = CookieSettings { secure: true };
        let development = CookieSettings { secure: false };

        for alias in [
            "%5F%5FHost-cas_session=tok",
            "__Host-cas%5Fsession=tok",
            "%5f%5fHost-cas_session=tok",
        ] {
            assert_eq!(secure.presented(&headers(&[alias])), None, "{alias}");
        }
        assert_eq!(
            development.presented(&headers(&["cas%5Fsession=tok"])),
            None
        );
        assert_eq!(
            development.presented(&headers(&["cas_session=tok"])),
            Some("tok".to_owned())
        );
    }

    #[test]
    fn secure_follows_the_origin_scheme() {
        assert!(CookieSettings::for_origin(&origin("https://cas.example.com")).secure);
        assert!(!CookieSettings::for_origin(&origin("http://localhost:5173")).secure);
    }

    /// The two names as they go on the wire, written out here so that the
    /// spelling a browser is asked to enforce the prefix rule on is pinned
    /// by something other than the code that builds it.
    #[test]
    fn the_name_follows_the_secure_setting() {
        assert_eq!(BASE_NAME, "cas_session");
        assert_eq!(PREFIXED_NAME, "__Host-cas_session");
        assert_eq!(CookieSettings { secure: true }.name(), PREFIXED_NAME);
        assert_eq!(CookieSettings { secure: false }.name(), BASE_NAME);
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

    /// The name is written out rather than taken from the settings, because
    /// the wire spelling is what makes a browser enforce the three
    /// attributes asserted under it: `Secure`, `Path=/` and no `Domain`.
    #[test]
    fn the_session_cookie_is_locked_down() {
        let token = SessionToken::generate().unwrap();
        let settings = CookieSettings { secure: true };

        let cookie = settings.session(&token, &fresh_session());

        assert_eq!(cookie.name(), "__Host-cas_session");
        assert_eq!(cookie.value(), token.expose());
        assert_eq!(cookie.http_only(), Some(true));
        assert_eq!(cookie.secure(), Some(true));
        assert_eq!(cookie.same_site(), Some(SameSite::Lax));
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.domain(), None, "host-only");
    }

    /// The development origin is plain http, so the cookie carries no
    /// `Secure` and therefore cannot carry the prefix either: a browser
    /// would refuse a `__Host-` cookie without it and the session would
    /// never reach the server.
    #[test]
    fn the_development_cookie_drops_the_prefix_with_secure() {
        let token = SessionToken::generate().unwrap();
        let settings = CookieSettings::for_origin(&origin("http://localhost:5173"));

        let cookie = settings.session(&token, &fresh_session());

        assert_eq!(cookie.name(), "cas_session");
        assert_eq!(cookie.secure(), Some(false));
        assert_eq!(cookie.http_only(), Some(true));
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

    /// Under either setting: a removal cookie that differs in name or in any
    /// attribute the prefix governs is a different cookie, and the browser
    /// would keep the one it holds.
    #[test]
    fn the_removal_cookie_matches_the_session_cookie_and_expires_at_once() {
        for secure in [true, false] {
            let settings = CookieSettings { secure };

            let cookie = settings.removal();

            assert_eq!(cookie.name(), settings.name());
            assert_eq!(cookie.value(), "");
            assert_eq!(cookie.path(), Some("/"));
            assert_eq!(cookie.http_only(), Some(true));
            assert_eq!(cookie.secure(), Some(secure));
            assert_eq!(cookie.domain(), None, "host-only");
            assert_eq!(cookie.max_age(), Some(time::Duration::ZERO));
        }
    }
}
