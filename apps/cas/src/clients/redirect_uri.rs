//! A registered redirect URI: where an authorization response, or a logout,
//! may be sent back to. Stored exactly as it was typed, because that is what
//! an incoming `redirect_uri` is compared against, byte for byte
//! (`docs/adr/0008-oidc-clients-registry.md`).

use std::cell::Cell;

use nutype::nutype;
use url::Url;

/// Why a string is not a [`RedirectUri`]: one variant per rule, so the
/// message names the rule broken.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RedirectUriError {
    #[error("must contain only characters allowed in a URI")]
    DisallowedCharacter,

    #[error("must be an absolute URI")]
    NotAbsolute,

    #[error("must be written in its canonical form")]
    MalformedSyntax,

    #[error("must use the http or https scheme")]
    UnsupportedScheme,

    /// Not reachable through the rules as they stand: `http` and `https` are
    /// what the WHATWG parser calls special schemes, and it refuses one
    /// without a host before this check is made (`https:///cb` is caught as
    /// [`MalformedSyntax`](Self::MalformedSyntax)). The rule is stated all
    /// the same, so that widening the scheme list cannot quietly let a
    /// hostless URI through.
    #[error("must have a host")]
    NoHost,

    #[error("must not have a fragment")]
    HasFragment,
}

/// Every byte RFC 3986 allows in a URI: unreserved, reserved, or the `%` that
/// introduces a percent-encoded octet. Everything else — a space, a control
/// character, a backslash, a quote, an angle bracket, anything non-ASCII — is
/// refused rather than repaired.
fn is_uri_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric()
        || matches!(
            b,
            b'-' | b'.'
                | b'_'
                | b'~'
                | b':'
                | b'/'
                | b'?'
                | b'#'
                | b'['
                | b']'
                | b'@'
                | b'!'
                | b'$'
                | b'&'
                | b'\''
                | b'('
                | b')'
                | b'*'
                | b'+'
                | b','
                | b';'
                | b'='
                | b'%'
        )
}

/// A successful parse is not enough. The WHATWG parser `url` implements is a
/// repair shop: it strips tabs and newlines, trims leading and trailing
/// controls and spaces, percent-encodes stray characters, turns a backslash
/// into a slash and reads `https:example.com` as `https://example.com`. Since
/// the *typed* string is what gets stored and matched, anything the parser
/// had to fix would be stored malformed and could never match a real request.
/// So the check is: RFC 3986 characters only, then a parse that reports no
/// syntax violation, then the scheme, host and fragment rules.
fn validate_redirect_uri(value: &str) -> Result<(), RedirectUriError> {
    if !value.bytes().all(is_uri_byte) {
        return Err(RedirectUriError::DisallowedCharacter);
    }

    let violated = Cell::new(false);
    let url = Url::options()
        .syntax_violation_callback(Some(&|_| violated.set(true)))
        .parse(value)
        .map_err(|_| RedirectUriError::NotAbsolute)?;
    if violated.get() {
        return Err(RedirectUriError::MalformedSyntax);
    }

    if !matches!(url.scheme(), "http" | "https") {
        return Err(RedirectUriError::UnsupportedScheme);
    }
    if url.host().is_none() {
        return Err(RedirectUriError::NoHost);
    }
    if url.fragment().is_some() {
        return Err(RedirectUriError::HasFragment);
    }

    Ok(())
}

/// A redirect URI as it was registered. Not sanitised and not normalised: the
/// stored string is compared with an incoming `redirect_uri` by simple string
/// comparison (OAuth 2.1 §4.1.3, RFC 6749 §3.1.2.3), so rewriting it here
/// would silently accept or refuse requests the operator did not register.
/// `https://app.example` and `https://app.example/` are therefore two
/// different registrations.
#[nutype(
    validate(with = validate_redirect_uri, error = RedirectUriError),
    derive(Debug, Clone, PartialEq, Eq, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct RedirectUri(String);

#[cfg(test)]
mod tests {
    use super::*;

    fn uri(value: &str) -> Result<String, RedirectUriError> {
        RedirectUri::try_new(value).map(Into::into)
    }

    #[test]
    fn accepts_an_absolute_http_url_without_a_fragment() {
        for value in [
            "https://app.example/cb",
            "http://localhost:5173/oidc/callback",
            "https://app.example/cb?x=1",
            "https://app.example:8443/cb",
            "https://app.example/cb%20x",
            "http://127.0.0.1:5173/cb",
        ] {
            assert_eq!(
                uri(value),
                Ok(value.to_owned()),
                "{value:?} must be accepted"
            );
        }
    }

    /// Nothing is normalised on the way in: the value is stored as typed,
    /// because that is the form an incoming request is compared against.
    #[test]
    fn keeps_the_typed_form() {
        assert_eq!(
            uri("https://app.example"),
            Ok("https://app.example".to_owned()),
            "the parser's trailing slash must not be stored"
        );
    }

    #[test]
    fn rejects_what_is_not_an_absolute_http_url() {
        assert_eq!(uri("/oidc/callback"), Err(RedirectUriError::NotAbsolute));
        assert_eq!(uri("app.example/cb"), Err(RedirectUriError::NotAbsolute));
        assert_eq!(uri(""), Err(RedirectUriError::NotAbsolute));
        assert_eq!(
            uri("https://a:x/"),
            Err(RedirectUriError::NotAbsolute),
            "an invalid port is a parse error"
        );
        assert_eq!(
            uri("ftp://app.example/cb"),
            Err(RedirectUriError::UnsupportedScheme)
        );
        assert_eq!(
            uri("custom-scheme://cb"),
            Err(RedirectUriError::UnsupportedScheme)
        );
        // A missing authority is caught one rule earlier: the parser reports
        // it as a syntax violation. See the note on `NoHost` above.
        assert_eq!(uri("https:///cb"), Err(RedirectUriError::MalformedSyntax));
        assert_eq!(
            uri("https://app.example/cb#x"),
            Err(RedirectUriError::HasFragment)
        );
    }

    /// Every string the parser would silently repair. A repaired value would
    /// be stored in a form no incoming request can ever equal.
    #[test]
    fn rejects_what_the_parser_would_repair() {
        for value in [
            "https://app.example/c\nb",
            "https://app.example/c\tb",
            " https://app.example/cb",
            "https://app.example/cb ",
            "https://app.example/c b",
            "https://app.example\\cb",
            "https://app.example/\u{7f}cb",
            "https://пример.рф/cb",
            "https://app.example/ünicode",
        ] {
            assert_eq!(
                uri(value),
                Err(RedirectUriError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }

        // Only `//` separates the scheme from the authority; the parser is
        // happy to add the slashes itself.
        assert_eq!(
            uri("https:app.example/cb"),
            Err(RedirectUriError::MalformedSyntax)
        );
    }

    #[test]
    fn deserialising_validates() {
        assert!(serde_json::from_str::<RedirectUri>("\"/cb\"").is_err());
        let ok: RedirectUri = serde_json::from_str("\"https://app.example/cb\"").unwrap();
        assert_eq!(ok.as_ref(), "https://app.example/cb");
    }
}
