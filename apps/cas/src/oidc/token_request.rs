//! What a token request is: the rules `POST /token` applies to its form body
//! and its `Authorization` header (ADR 0011). Pure domain: no axum, no SQL.
//! The service applies them in order, with the lookups between them — the
//! client is authenticated before the grant is looked at, and the code is
//! redeemed before its verifier is checked (ADR 0011); a refresh token is
//! checked against its grant before it is spent (ADR 0012); a guest is
//! minted only for a client allowed to, within its limit (ADR 0014).

use std::time::Duration;

use base64::{Engine, engine::general_purpose::STANDARD};

use super::authorization::{Duplicate, Params};
use super::codes::{AuthorizationCode, CodeVerifier};
use super::tokens::RefreshToken;
use super::{GUEST_GRANT_TYPE, OPENID_SCOPE};
use crate::clients::{Client, ClientId, Scope};

/// Every parameter a token request is read for. A repetition of any of them
/// is refused before any other rule is looked at, as at `/authorize` (RFC
/// 6749 §3.2: parameters MUST NOT be included more than once).
const READ_PARAMETERS: [&str; 8] = [
    "grant_type",
    "code",
    "redirect_uri",
    "code_verifier",
    "refresh_token",
    "scope",
    "client_id",
    "client_secret",
];

/// The code exchange (RFC 6749 §4.1.3, ADR 0011).
const AUTHORIZATION_CODE_GRANT_TYPE: &str = "authorization_code";

/// The refresh with rotation (RFC 6749 §6, ADR 0012).
const REFRESH_TOKEN_GRANT_TYPE: &str = "refresh_token";

/// Why a token request was refused, or failed. Every variant but the last
/// two is an error the client gets back as is (RFC 6749 §5.2, and the guest
/// grant's own `rate_limit_exceeded`), with a fixed description: nothing
/// from the request is ever reflected into it.
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

    /// The `scope` of a refresh is malformed or asks for more than the
    /// grant holds (RFC 6749 §6); the `scope` of a guest grant is malformed,
    /// lacks `openid`, or leaves the client's allow-list.
    #[error("invalid scope: {0}")]
    InvalidScope(&'static str),

    /// The authenticated client may not use this grant type (RFC 6749
    /// §5.2): the guest grant asked for by a public client, or by a
    /// confidential one without `guest_login_allowed`.
    #[error("the client is not authorized to use this grant type")]
    UnauthorizedClient,

    /// The client has minted as many guests as its limit allows in the
    /// current window; `retry_after` is when to try again.
    #[error("guest grant rate limit exceeded")]
    RateLimited { retry_after: Duration },

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

/// The `invalid_grant` description for a refresh token that does not
/// refresh, however it failed: unknown, expired, revoked, already used, or
/// issued to another client (ADR 0012 (e)). The client's remedy is the same,
/// a new sign-in, and the logs keep the reasons apart.
pub const INVALID_REFRESH_TOKEN: &str =
    "the refresh token is invalid, expired, revoked or already used";

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

/// A refresh token grant, read and shaped but not yet looked up. `Debug` is
/// safe: the token's own is redacted.
#[derive(Debug)]
pub struct RefreshGrant {
    pub refresh_token: RefreshToken,
    /// The scopes the request names, deduplicated in request order; `None`
    /// when it names none, which asks for the grant's scopes (RFC 6749 §6).
    pub scope: Option<Vec<Scope>>,
}

/// A guest grant, read but not yet checked: whether the client may use it,
/// and which scopes it gets, depend on the client ([`guest_scopes`]).
#[derive(Debug)]
pub struct GuestGrant {
    /// The `scope` parameter as sent, unparsed; `None` when omitted.
    pub scope: Option<String>,
}

/// The grants `POST /token` serves.
#[derive(Debug)]
pub enum Grant {
    Code(CodeGrant),
    Refresh(RefreshGrant),
    Guest(GuestGrant),
}

/// The grant a request asks for, after the client is authenticated. The
/// rules are applied in order, and the first that fails is the answer.
pub fn grant(params: &Params) -> Result<Grant, TokenError> {
    match params.get("grant_type")? {
        None => Err(TokenError::InvalidRequest("grant_type is required")),
        Some(AUTHORIZATION_CODE_GRANT_TYPE) => code_grant(params).map(Grant::Code),
        Some(REFRESH_TOKEN_GRANT_TYPE) => refresh_grant(params).map(Grant::Refresh),
        Some(GUEST_GRANT_TYPE) => Ok(Grant::Guest(GuestGrant {
            scope: params.get("scope")?.map(str::to_owned),
        })),
        Some(_) => Err(TokenError::UnsupportedGrantType),
    }
}

/// The rest of an `authorization_code` request. A code that does not have
/// the shape CAS issues is `invalid_grant` at once: it cannot be a code, and
/// asking the database would only cost a query.
fn code_grant(params: &Params) -> Result<CodeGrant, TokenError> {
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

/// The rest of a `refresh_token` request. `scope` is split and checked as
/// `/authorize` checks it, and a malformed one is the same `invalid_scope`;
/// whether it fits the grant is for the service to say, once the grant is
/// found. A token that does not have the shape CAS issues is `invalid_grant`
/// without a query, as a code is.
fn refresh_grant(params: &Params) -> Result<RefreshGrant, TokenError> {
    let refresh_token = params
        .get("refresh_token")?
        .ok_or(TokenError::InvalidRequest("refresh_token is required"))?;
    let scope = params.get("scope")?.map(requested_scopes).transpose()?;
    let refresh_token = RefreshToken::parse(refresh_token)
        .ok_or(TokenError::InvalidGrant(INVALID_REFRESH_TOKEN))?;

    Ok(RefreshGrant {
        refresh_token,
        scope,
    })
}

/// The scopes a guest grant gets for `client`. Omitted, `openid` alone:
/// a guest has no name and no address to release, so the client's whole
/// allow-list would only promise claims that never come. Present, the list
/// must be well formed, include `openid`, and stay inside the client's
/// allow-list, the default included (ADR 0014 (d)). The descriptions are
/// fixed strings; nothing of the request is reflected.
pub fn guest_scopes(requested: Option<&str>, client: &Client) -> Result<Vec<Scope>, TokenError> {
    let scopes = match requested {
        None => vec![Scope::try_new(OPENID_SCOPE).expect("openid is a valid scope token")],
        Some(value) => requested_scopes(value)?,
    };
    if !scopes.iter().any(|scope| scope.as_str() == OPENID_SCOPE) {
        return Err(TokenError::InvalidScope("scope must include openid"));
    }
    if !scopes
        .iter()
        .all(|scope| client.allows_scope(scope.as_str()))
    {
        return Err(TokenError::InvalidScope(
            "the requested scope is not allowed for this client",
        ));
    }
    Ok(scopes)
}

/// A space-separated scope list, deduplicated in request order.
fn requested_scopes(value: &str) -> Result<Vec<Scope>, TokenError> {
    let mut scopes: Vec<Scope> = Vec::new();
    for token in value.split(' ') {
        let scope =
            Scope::try_new(token).map_err(|_| TokenError::InvalidScope("scope is malformed"))?;
        if !scopes.contains(&scope) {
            scopes.push(scope);
        }
    }
    Ok(scopes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::{Audience, ClientKind, ClientName, GuestGrantsPerMinute, RedirectUri};
    use crate::testing::scopes;

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
        grant(&params(&pairs)).expect_err("the grant must be refused")
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
        assert!(refuse_repeated(&params(&[("state", "a"), ("state", "b")])).is_ok());
    }

    #[test]
    fn a_valid_code_grant_is_read() {
        let code = code();
        let pairs: Vec<(&str, String)> = valid_grant(&code);
        let pairs: Vec<(&str, &str)> = pairs.iter().map(|(n, v)| (*n, v.as_str())).collect();

        let Grant::Code(grant) = grant(&params(&pairs)).unwrap() else {
            panic!("a code grant");
        };

        assert_eq!(grant.code.expose(), code);
        assert_eq!(grant.redirect_uri, "https://app.example/cb");
        assert_eq!(grant.verifier, CodeVerifier::try_new(VERIFIER).unwrap());
    }

    #[test]
    fn grant_type_must_be_a_served_one() {
        let code = code();
        assert!(matches!(
            grant_error(&without("grant_type", &code)),
            TokenError::InvalidRequest("grant_type is required")
        ));
        for other in [
            "password",
            "client_credentials",
            "CODE",
            "urn:memebattle:oauth:grant-type:GUEST",
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

    fn refresh_token() -> String {
        RefreshToken::generate().unwrap().expose().to_owned()
    }

    fn refresh(pairs: &[(&str, &str)]) -> Result<RefreshGrant, TokenError> {
        let mut all = vec![("grant_type", "refresh_token")];
        all.extend_from_slice(pairs);
        grant(&params(&all)).map(|grant| match grant {
            Grant::Refresh(grant) => grant,
            Grant::Code(_) | Grant::Guest(_) => panic!("a refresh grant"),
        })
    }

    #[test]
    fn a_refresh_grant_is_read() {
        let token = refresh_token();

        let grant = refresh(&[("refresh_token", &token)]).unwrap();

        assert_eq!(grant.refresh_token.expose(), token);
        assert_eq!(grant.scope, None);
    }

    #[test]
    fn a_refresh_scope_is_split_and_deduplicated_in_request_order() {
        let token = refresh_token();

        let grant = refresh(&[
            ("refresh_token", &token),
            ("scope", "profile openid profile"),
        ])
        .unwrap();

        assert_eq!(
            grant.scope,
            Some(
                ["profile", "openid"]
                    .map(|scope| Scope::try_new(scope).unwrap())
                    .to_vec()
            )
        );
    }

    #[test]
    fn a_refresh_token_is_required() {
        for pairs in [vec![], vec![("refresh_token", "")]] {
            let error = refresh(&pairs).unwrap_err();

            assert!(
                matches!(
                    error,
                    TokenError::InvalidRequest("refresh_token is required")
                ),
                "{pairs:?}: {error:?}"
            );
        }
    }

    #[test]
    fn a_malformed_refresh_scope_is_invalid_scope() {
        let token = refresh_token();
        for scope in ["openid  profile", "openid\tprofile", "open\"id", " openid"] {
            let error = refresh(&[("refresh_token", &token), ("scope", scope)]).unwrap_err();

            assert!(
                matches!(error, TokenError::InvalidScope("scope is malformed")),
                "{scope:?}: {error:?}"
            );
        }
    }

    /// Checked after the other rules, and before any query.
    #[test]
    fn a_refresh_token_of_the_wrong_shape_is_invalid_grant() {
        for token in ["not-a-token", &"A".repeat(42), &"A".repeat(44)] {
            let error = refresh(&[("refresh_token", token)]).unwrap_err();

            assert!(
                matches!(error, TokenError::InvalidGrant(INVALID_REFRESH_TOKEN)),
                "{token}: {error:?}"
            );
        }
        let error = refresh(&[("refresh_token", "not-a-token"), ("scope", "open\"id")]);
        assert!(matches!(
            error,
            Err(TokenError::InvalidScope("scope is malformed"))
        ));
    }

    #[test]
    fn debug_of_a_refresh_grant_hides_the_token() {
        let token = refresh_token();

        let debug = format!("{:?}", refresh(&[("refresh_token", &token)]).unwrap());

        assert!(!debug.contains(&token), "{debug}");
    }

    #[test]
    fn a_guest_grant_is_read_with_its_raw_scope() {
        for (pairs, expected) in [
            (vec![("grant_type", GUEST_GRANT_TYPE)], None),
            (vec![("grant_type", GUEST_GRANT_TYPE), ("scope", "")], None),
            (
                vec![("grant_type", GUEST_GRANT_TYPE), ("scope", "openid  bad")],
                Some("openid  bad"),
            ),
        ] {
            let Grant::Guest(grant) = grant(&params(&pairs)).unwrap() else {
                panic!("a guest grant: {pairs:?}");
            };

            assert_eq!(grant.scope.as_deref(), expected, "{pairs:?}");
        }
    }

    /// A client of the allow-list given, as registered.
    fn guest_client(allowed: &[&str]) -> Client {
        Client {
            id: ClientId::try_new("ligretto").unwrap(),
            name: ClientName::try_new("Ligretto").unwrap(),
            kind: ClientKind::Confidential,
            secret_hash: None,
            redirect_uris: vec![RedirectUri::try_new("https://app.example/cb").unwrap()],
            post_logout_redirect_uris: vec![],
            first_party: true,
            guest_login_allowed: true,
            guest_grants_per_minute: GuestGrantsPerMinute::default(),
            scopes: scopes(allowed),
            audience: Audience::try_new("ligretto").unwrap(),
            created_at: time::OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn an_omitted_guest_scope_is_openid_alone() {
        let client = guest_client(&["openid", "profile", "email"]);

        assert_eq!(guest_scopes(None, &client).unwrap(), scopes(&["openid"]));
    }

    #[test]
    fn a_guest_scope_is_kept_in_order_and_deduplicated() {
        let client = guest_client(&["openid", "profile", "email"]);

        assert_eq!(
            guest_scopes(Some("profile openid profile"), &client).unwrap(),
            scopes(&["profile", "openid"])
        );
    }

    #[test]
    fn a_guest_scope_is_refused_with_a_fixed_description() {
        let client = guest_client(&["openid", "profile"]);
        for (requested, description) in [
            ("profile", "scope must include openid"),
            (
                "openid email",
                "the requested scope is not allowed for this client",
            ),
            ("openid  profile", "scope is malformed"),
            ("open\"id", "scope is malformed"),
        ] {
            let error = guest_scopes(Some(requested), &client).unwrap_err();

            assert!(
                matches!(error, TokenError::InvalidScope(d) if d == description),
                "{requested:?}: {error:?}"
            );
        }
    }

    /// The default is checked against the allow-list like any request.
    #[test]
    fn the_default_guest_scope_needs_openid_in_the_allow_list() {
        let client = guest_client(&["profile"]);

        let error = guest_scopes(None, &client).unwrap_err();

        assert!(
            matches!(
                error,
                TokenError::InvalidScope("the requested scope is not allowed for this client")
            ),
            "{error:?}"
        );
    }
}
