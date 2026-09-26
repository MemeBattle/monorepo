//! What a token request is: the rules `POST /token` applies to its form body
//! and its `Authorization` header (ADR 0011). Pure domain: no axum, no SQL.
//! The service applies them in order, with the lookups between them — the
//! client is authenticated before the grant is looked at, and the code is
//! redeemed before its verifier is checked.

use base64::{Engine, engine::general_purpose::STANDARD};

use super::authorization::{Duplicate, Params};
use super::codes::{AuthorizationCode, CodeVerifier};
use crate::clients::ClientId;

/// Every parameter a token request is read for. A repetition of any of them
/// is refused before any other rule is looked at, as at `/authorize` (RFC
/// 6749 §3.2: parameters MUST NOT be included more than once).
const READ_PARAMETERS: [&str; 6] = [
    "grant_type",
    "code",
    "redirect_uri",
    "code_verifier",
    "client_id",
    "client_secret",
];

/// The one `grant_type` served so far.
const AUTHORIZATION_CODE_GRANT_TYPE: &str = "authorization_code";

/// Why a token request was refused, or failed. Every variant but the last
/// two is an RFC 6749 §5.2 error the client gets back as is, with a fixed
/// description: nothing from the request is ever reflected into it.
#[derive(Debug, thiserror::Error)]
pub enum TokenError {
    #[error("invalid request: {0}")]
    InvalidRequest(&'static str),

    /// `invalid_request` for a parameter sent more than once. The name comes
    /// from [`READ_PARAMETERS`], never from the request.
    #[error("parameter {0} is repeated")]
    Repeated(&'static str),

    /// The client is unknown, presented no credentials, or the wrong ones.
    /// One answer for all of them, so the endpoint does not say which
    /// clients exist. `basic` records that the client tried the `Basic`
    /// scheme, which RFC 6749 §5.2 answers with a challenge.
    #[error("client authentication failed")]
    InvalidClient { basic: bool },

    #[error("invalid grant: {0}")]
    InvalidGrant(&'static str),

    #[error("unsupported grant type")]
    UnsupportedGrantType,

    #[error("the operating system refused to provide randomness: {0}")]
    Random(getrandom::Error),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl From<Duplicate> for TokenError {
    fn from(Duplicate(name): Duplicate) -> Self {
        Self::Repeated(name)
    }
}

/// The `invalid_grant` description for a code that does not redeem, however
/// it failed: unknown, expired, replayed, or bound to another client or
/// redirect URI. The client's remedy is the same, a new authorization
/// request, and a finer answer would help only someone probing codes.
pub const INVALID_CODE: &str =
    "the authorization code is invalid, expired, already used or issued for another request";

/// Refuses a request that repeats a parameter the endpoint reads, before any
/// other rule.
pub fn refuse_repeated(params: &Params) -> Result<(), TokenError> {
    for name in READ_PARAMETERS {
        params.get(name)?;
    }
    Ok(())
}

/// Who a request says it is, and the secret it offers for it. `Debug` shows
/// the id and whether a secret was offered, never the secret.
#[derive(Clone, PartialEq, Eq)]
pub struct ClientCredentials {
    pub client_id: ClientId,
    /// `None` for a public client, which authenticates with nothing but its
    /// id (and proves itself with PKCE).
    pub secret: Option<String>,
    /// The credentials came in an `Authorization: Basic` header.
    pub basic: bool,
}

impl std::fmt::Debug for ClientCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientCredentials")
            .field("client_id", &self.client_id)
            .field("secret", &self.secret.as_ref().map(|_| "<redacted>"))
            .field("basic", &self.basic)
            .finish()
    }
}

/// The client credentials of a request (RFC 6749 §2.3): an `Authorization:
/// Basic` header (`client_secret_basic`), or `client_id` and `client_secret`
/// in the body (`client_secret_post`), or `client_id` alone for a public
/// client. `authorization` is the header's value as received, if there was
/// exactly one.
///
/// Presenting a secret both ways is using two methods at once, which §2.3
/// forbids: `invalid_request`. A body `client_id` next to the header is
/// tolerated when it names the same client, as some libraries send it
/// anyway; a different one is the same contradiction.
pub fn client_credentials(
    params: &Params,
    authorization: Option<&[u8]>,
) -> Result<ClientCredentials, TokenError> {
    let body_id = params.get("client_id")?;
    let body_secret = params.get("client_secret")?;

    let Some(header) = authorization else {
        let client_id = body_id
            .and_then(|id| ClientId::try_new(id).ok())
            .ok_or(TokenError::InvalidClient { basic: false })?;
        return Ok(ClientCredentials {
            client_id,
            secret: body_secret.map(str::to_owned),
            basic: false,
        });
    };

    let (client_id, secret) =
        basic_credentials(header).ok_or(TokenError::InvalidClient { basic: true })?;
    if body_secret.is_some() {
        return Err(TokenError::InvalidRequest(
            "the client authenticated with more than one method",
        ));
    }
    if body_id.is_some_and(|id| id != client_id.as_str()) {
        return Err(TokenError::InvalidRequest(
            "client_id does not match the Authorization header",
        ));
    }
    Ok(ClientCredentials {
        client_id,
        secret: Some(secret),
        basic: true,
    })
}

/// `Basic base64(urlencode(client_id) ":" urlencode(secret))`, RFC 6749
/// §2.3.1 over RFC 7617. The scheme is case-insensitive; everything else is
/// strict, and anything that does not decode — another scheme, bad base64,
/// no colon, a malformed escape, an id outside the grammar — is `None`.
fn basic_credentials(header: &[u8]) -> Option<(ClientId, String)> {
    let header = std::str::from_utf8(header).ok()?;
    let (scheme, encoded) = header.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("basic") {
        return None;
    }
    let decoded = String::from_utf8(STANDARD.decode(encoded.trim()).ok()?).ok()?;
    let (id, secret) = decoded.split_once(':')?;
    let client_id = ClientId::try_new(form_decode(id)?).ok()?;
    Some((client_id, form_decode(secret)?))
}

/// Undoes `application/x-www-form-urlencoded` on one value: `+` is a space,
/// `%XX` a byte. Strict where a form parser is lenient: a `%` without two
/// hex digits after it, or bytes that are not UTF-8, is `None`, because
/// these are credentials and a repaired value is not the one that was sent.
fn form_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => decoded.push(b' '),
            b'%' => {
                let high = hex_digit(*bytes.get(index + 1)?)?;
                let low = hex_digit(*bytes.get(index + 2)?)?;
                decoded.push(high << 4 | low);
                index += 2;
            }
            byte => decoded.push(byte),
        }
        index += 1;
    }
    String::from_utf8(decoded).ok()
}

fn hex_digit(byte: u8) -> Option<u8> {
    char::from(byte)
        .to_digit(16)
        .and_then(|digit| u8::try_from(digit).ok())
}

/// An authorization code grant, read and shaped but not yet redeemed.
#[derive(Debug)]
pub struct CodeGrant {
    pub code: AuthorizationCode,
    /// Exactly as sent; redemption compares it byte for byte with the one
    /// the code was issued for.
    pub redirect_uri: String,
    pub verifier: CodeVerifier,
}

/// The grant a request asks for, after the client is authenticated. Only
/// `authorization_code` is served; the rules are applied in order, and the
/// first that fails is the answer. A code that does not have the shape CAS
/// issues is `invalid_grant` at once: it cannot be a code, and asking the
/// database would only cost a query.
pub fn code_grant(params: &Params) -> Result<CodeGrant, TokenError> {
    match params.get("grant_type")? {
        None => return Err(TokenError::InvalidRequest("grant_type is required")),
        Some(AUTHORIZATION_CODE_GRANT_TYPE) => {}
        // `refresh_token` arrives with #744 and the guest grant with #746,
        // both advertised by discovery already; until then they are as
        // unsupported as any other value.
        Some(_) => return Err(TokenError::UnsupportedGrantType),
    }

    let code = params
        .get("code")?
        .ok_or(TokenError::InvalidRequest("code is required"))?;
    let redirect_uri = params
        .get("redirect_uri")?
        .ok_or(TokenError::InvalidRequest("redirect_uri is required"))?;
    let verifier = params
        .get("code_verifier")?
        .ok_or(TokenError::InvalidRequest("code_verifier is required"))?;
    let verifier = CodeVerifier::try_new(verifier)
        .map_err(|_| TokenError::InvalidRequest("code_verifier is malformed"))?;

    let code = AuthorizationCode::parse(code).ok_or(TokenError::InvalidGrant(INVALID_CODE))?;

    Ok(CodeGrant {
        code,
        redirect_uri: redirect_uri.to_owned(),
        verifier,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::oidc::GUEST_GRANT_TYPE;

    const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    fn params(pairs: &[(&str, &str)]) -> Params {
        let query = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(pairs)
            .finish();
        Params::from_query(&query)
    }

    fn basic(id: &str, secret: &str) -> Vec<u8> {
        format!("Basic {}", STANDARD.encode(format!("{id}:{secret}"))).into_bytes()
    }

    fn code() -> String {
        AuthorizationCode::generate().unwrap().expose().to_owned()
    }

    fn valid_grant(code: &str) -> Vec<(&'static str, String)> {
        vec![
            ("grant_type", "authorization_code".to_owned()),
            ("code", code.to_owned()),
            ("redirect_uri", "https://app.example/cb".to_owned()),
            ("code_verifier", VERIFIER.to_owned()),
        ]
    }

    fn grant_error(pairs: &[(&'static str, String)]) -> TokenError {
        let pairs: Vec<(&str, &str)> = pairs.iter().map(|(n, v)| (*n, v.as_str())).collect();
        code_grant(&params(&pairs)).expect_err("the grant must be refused")
    }

    fn without(name: &str, code: &str) -> Vec<(&'static str, String)> {
        valid_grant(code)
            .into_iter()
            .filter(|(n, _)| *n != name)
            .collect()
    }

    fn with(name: &'static str, value: &str, code: &str) -> Vec<(&'static str, String)> {
        let mut pairs = without(name, code);
        pairs.push((name, value.to_owned()));
        pairs
    }

    #[test]
    fn basic_credentials_are_read_and_form_decoded() {
        let credentials =
            client_credentials(&Params::default(), Some(&basic("ligretto", "s%2Bcr%3At+x")))
                .unwrap();

        assert_eq!(credentials.client_id.as_str(), "ligretto");
        assert_eq!(credentials.secret.as_deref(), Some("s+cr:t x"));
        assert!(credentials.basic);
    }

    #[test]
    fn the_basic_scheme_is_case_insensitive() {
        let header = format!("bAsIc {}", STANDARD.encode("ligretto:secret"));

        let credentials = client_credentials(&Params::default(), Some(header.as_bytes())).unwrap();

        assert_eq!(credentials.secret.as_deref(), Some("secret"));
    }

    #[test]
    fn a_malformed_basic_header_is_invalid_client_with_a_challenge() {
        let bad_escape = basic("ligretto", "%zz");
        let bad_id = basic("Not A Slug", "secret");
        let no_colon = format!("Basic {}", STANDARD.encode("ligretto"));
        for header in [
            b"Bearer abc".as_slice(),
            b"Basic",
            b"Basic !!!",
            no_colon.as_bytes(),
            &bad_escape,
            &bad_id,
            b"Basic \xff",
        ] {
            let error = client_credentials(&Params::default(), Some(header)).unwrap_err();
            assert!(
                matches!(error, TokenError::InvalidClient { basic: true }),
                "{:?}: {error:?}",
                String::from_utf8_lossy(header)
            );
        }
    }

    #[test]
    fn post_credentials_are_read_from_the_body() {
        let credentials = client_credentials(
            &params(&[("client_id", "ligretto"), ("client_secret", "secret")]),
            None,
        )
        .unwrap();

        assert_eq!(credentials.client_id.as_str(), "ligretto");
        assert_eq!(credentials.secret.as_deref(), Some("secret"));
        assert!(!credentials.basic);
    }

    #[test]
    fn a_public_client_presents_its_id_alone() {
        for pairs in [
            vec![("client_id", "spa")],
            vec![("client_id", "spa"), ("client_secret", "")],
        ] {
            let credentials = client_credentials(&params(&pairs), None).unwrap();

            assert_eq!(credentials.client_id.as_str(), "spa");
            assert_eq!(credentials.secret, None, "an empty value is omitted");
        }
    }

    #[test]
    fn no_client_id_at_all_is_invalid_client_without_a_challenge() {
        for pairs in [
            vec![],
            vec![("client_id", "")],
            vec![("client_id", "Not A Slug")],
        ] {
            let error = client_credentials(&params(&pairs), None).unwrap_err();

            assert!(
                matches!(error, TokenError::InvalidClient { basic: false }),
                "{pairs:?}: {error:?}"
            );
        }
    }

    #[test]
    fn a_secret_in_both_places_is_two_methods() {
        let error = client_credentials(
            &params(&[("client_secret", "secret")]),
            Some(&basic("ligretto", "secret")),
        )
        .unwrap_err();

        assert!(
            matches!(
                error,
                TokenError::InvalidRequest("the client authenticated with more than one method")
            ),
            "{error:?}"
        );
    }

    #[test]
    fn a_body_client_id_next_to_basic_must_name_the_same_client() {
        let header = basic("ligretto", "secret");

        assert!(client_credentials(&params(&[("client_id", "ligretto")]), Some(&header)).is_ok());
        let error =
            client_credentials(&params(&[("client_id", "other")]), Some(&header)).unwrap_err();
        assert!(
            matches!(
                error,
                TokenError::InvalidRequest("client_id does not match the Authorization header")
            ),
            "{error:?}"
        );
    }

    #[test]
    fn a_repeated_parameter_is_refused_by_name() {
        for name in READ_PARAMETERS {
            let error = refuse_repeated(&params(&[(name, "a"), (name, "")])).unwrap_err();

            assert!(
                matches!(error, TokenError::Repeated(repeated) if repeated == name),
                "{name}"
            );
        }
        assert!(refuse_repeated(&params(&[("scope", "a"), ("scope", "b")])).is_ok());
    }

    #[test]
    fn a_valid_code_grant_is_read() {
        let code = code();
        let pairs: Vec<(&str, String)> = valid_grant(&code);
        let pairs: Vec<(&str, &str)> = pairs.iter().map(|(n, v)| (*n, v.as_str())).collect();

        let grant = code_grant(&params(&pairs)).unwrap();

        assert_eq!(grant.code.expose(), code);
        assert_eq!(grant.redirect_uri, "https://app.example/cb");
        assert_eq!(grant.verifier, CodeVerifier::try_new(VERIFIER).unwrap());
    }

    #[test]
    fn grant_type_must_be_authorization_code() {
        let code = code();
        assert!(matches!(
            grant_error(&without("grant_type", &code)),
            TokenError::InvalidRequest("grant_type is required")
        ));
        for other in [
            "refresh_token",
            GUEST_GRANT_TYPE,
            "password",
            "client_credentials",
            "CODE",
        ] {
            assert!(
                matches!(
                    grant_error(&with("grant_type", other, &code)),
                    TokenError::UnsupportedGrantType
                ),
                "{other}"
            );
        }
    }

    #[test]
    fn code_redirect_uri_and_code_verifier_are_required() {
        let code = code();
        for (name, description) in [
            ("code", "code is required"),
            ("redirect_uri", "redirect_uri is required"),
            ("code_verifier", "code_verifier is required"),
        ] {
            let error = grant_error(&without(name, &code));
            assert!(
                matches!(error, TokenError::InvalidRequest(d) if d == description),
                "{name}: {error:?}"
            );
            let error = grant_error(&with(name, "", &code));
            assert!(
                matches!(error, TokenError::InvalidRequest(d) if d == description),
                "{name} empty: {error:?}"
            );
        }
    }

    #[test]
    fn a_verifier_outside_the_grammar_is_invalid_request() {
        for verifier in ["short", &"a".repeat(129), &format!("{}+", "a".repeat(42))] {
            assert!(
                matches!(
                    grant_error(&with("code_verifier", verifier, &code())),
                    TokenError::InvalidRequest("code_verifier is malformed")
                ),
                "{verifier}"
            );
        }
    }

    /// Checked after the required parameters, and before any query.
    #[test]
    fn a_code_of_the_wrong_shape_is_invalid_grant() {
        assert!(matches!(
            grant_error(&valid_grant("not-a-code")),
            TokenError::InvalidGrant(INVALID_CODE)
        ));
        assert!(matches!(
            grant_error(&without("code_verifier", "not-a-code")),
            TokenError::InvalidRequest("code_verifier is required")
        ));
    }

    #[test]
    fn debug_of_credentials_hides_the_secret() {
        let credentials = client_credentials(
            &Params::default(),
            Some(&basic("ligretto", "hunter2hunter2")),
        )
        .unwrap();

        let debug = format!("{credentials:?}");

        assert!(!debug.contains("hunter2"), "{debug}");
        assert!(debug.contains("ligretto"), "{debug}");
    }
}
