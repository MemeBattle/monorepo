//! The flow cookie: the one place its name and attributes are decided.
//!
//! It carries the one-time secret that binds a flow to the browser that
//! started it (ADR 0023 (d)). The mechanics are the session cookie's — the
//! `__Host-` prefix where there is `Secure` to carry it, the wire-name lookup
//! that does not percent-decode — and the deployment's
//! [`CookieSettings`] decide the same way for both. What differs is the name,
//! and that it lives for one flow rather than one session.

use axum::http::HeaderMap;
use axum_extra::extract::cookie::{Cookie, SameSite};

use crate::http::extract::presented_cookie;
use crate::identities::{FLOW_TIMEOUT, FlowSecret};
use crate::sessions::http::CookieSettings;

/// The name itself, as a macro so that the prefixed spelling below is this
/// same literal with the prefix glued on while compiling: a name is borrowed
/// for the life of the process and cannot be joined at runtime.
macro_rules! base_name {
    () => {
        "cas_identity_flow"
    };
}

/// The name where there is no `Secure` to carry a prefix.
const BASE_NAME: &str = base_name!();

/// The name OWASP asks for, for the same reason the session cookie takes it:
/// a browser holds everyone setting a `__Host-` name to `Secure`, no `Domain`
/// and `Path=/`, which is what closes cookie tossing from a sibling
/// subdomain.
const PREFIXED_NAME: &str = concat!("__Host-", base_name!());

/// The name the cookie goes out under, and therefore the name the callback
/// looks for and the removal cookie must match. The prefix rides on `Secure`,
/// so the name follows the setting.
pub(crate) fn name(settings: &CookieSettings) -> &'static str {
    if settings.secure {
        PREFIXED_NAME
    } else {
        BASE_NAME
    }
}

/// The cookie that carries a flow secret, set when the flow starts.
///
/// `HttpOnly`: script never reads it. `SameSite=Lax`: the callback is a
/// top-level navigation from the provider, which is exactly the case `Lax`
/// sends a cookie on, and `None` would be needed for nothing here.
/// `Max-Age`: the flow's own timeout, so the browser forgets the secret when
/// the server stops honouring the flow.
pub(crate) fn flow(settings: &CookieSettings, secret: &FlowSecret) -> Cookie<'static> {
    let mut cookie = base(settings, secret.expose().to_owned());
    cookie.set_max_age(
        time::Duration::try_from(FLOW_TIMEOUT).expect("the flow timeout fits in time::Duration"),
    );
    cookie
}

/// The cookie that removes the flow cookie: same name, path and flags,
/// `Max-Age=0`. The attributes must match for the browser to treat it as the
/// same cookie. The callback sends it whatever it answers — the flow is spent
/// either way.
pub(crate) fn removal(settings: &CookieSettings) -> Cookie<'static> {
    let mut cookie = base(settings, String::new());
    cookie.set_max_age(time::Duration::ZERO);
    cookie
}

/// The secret the request presents under the flow cookie's name, or `None`
/// when it presents nothing under it.
pub(crate) fn presented(settings: &CookieSettings, headers: &HeaderMap) -> Option<String> {
    presented_cookie(headers, name(settings))
}

fn base(settings: &CookieSettings, value: String) -> Cookie<'static> {
    Cookie::build((name(settings), value))
        .http_only(true)
        .secure(settings.secure)
        .same_site(SameSite::Lax)
        .path("/")
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::header;

    fn headers(cookies: &[&str]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for cookie in cookies {
            headers.append(header::COOKIE, cookie.parse().unwrap());
        }
        headers
    }

    /// The two names as they go on the wire, written out so that the spelling
    /// a browser enforces the prefix rule on is pinned by something other
    /// than the code that builds it. They must differ from the session
    /// cookie's, or the renewal layer could not tell the two apart.
    #[test]
    fn the_name_follows_the_secure_setting_and_is_not_the_sessions() {
        assert_eq!(BASE_NAME, "cas_identity_flow");
        assert_eq!(PREFIXED_NAME, "__Host-cas_identity_flow");
        assert_eq!(name(&CookieSettings { secure: true }), PREFIXED_NAME);
        assert_eq!(name(&CookieSettings { secure: false }), BASE_NAME);
        for secure in [true, false] {
            let settings = CookieSettings { secure };
            assert_ne!(name(&settings), settings.name());
        }
    }

    #[test]
    fn the_flow_cookie_is_locked_down_and_lives_for_one_flow() {
        let secret = FlowSecret::generate().unwrap();

        let cookie = flow(&CookieSettings { secure: true }, &secret);

        assert_eq!(cookie.name(), "__Host-cas_identity_flow");
        assert_eq!(cookie.value(), secret.expose());
        assert_eq!(cookie.http_only(), Some(true));
        assert_eq!(cookie.secure(), Some(true));
        assert_eq!(cookie.same_site(), Some(SameSite::Lax));
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.domain(), None);
        assert_eq!(
            cookie.max_age(),
            Some(time::Duration::try_from(FLOW_TIMEOUT).unwrap())
        );
    }

    /// The removal has to look like the cookie it removes, or the browser
    /// keeps the original.
    #[test]
    fn the_removal_matches_the_cookie_it_removes() {
        let settings = CookieSettings { secure: false };
        let set = flow(&settings, &FlowSecret::generate().unwrap());
        let removal = removal(&settings);

        assert_eq!(removal.name(), set.name());
        assert_eq!(removal.path(), set.path());
        assert_eq!(removal.secure(), set.secure());
        assert_eq!(removal.same_site(), set.same_site());
        assert_eq!(removal.value(), "");
        assert_eq!(removal.max_age(), Some(time::Duration::ZERO));
    }

    /// The name is matched on the wire, undecoded, for the reason
    /// `CookieSettings::presented` spells out: a percent-encoded spelling is
    /// another name, and a browser never holds it to the `__Host-` rules.
    #[test]
    fn presented_finds_the_cookie_by_its_exact_name() {
        let settings = CookieSettings { secure: true };

        assert_eq!(
            presented(
                &settings,
                &headers(&["other=1; __Host-cas_identity_flow=s3cret; more=2"])
            ),
            Some("s3cret".to_owned())
        );
        assert_eq!(
            presented(
                &settings,
                &headers(&["%5F%5FHost-cas_identity_flow=s3cret"])
            ),
            None
        );
        assert_eq!(
            presented(&settings, &headers(&["cas_identity_flow=s3cret"])),
            None,
            "the unprefixed name is another cookie on a secure deployment"
        );
        assert_eq!(presented(&settings, &headers(&[])), None);
    }
}
