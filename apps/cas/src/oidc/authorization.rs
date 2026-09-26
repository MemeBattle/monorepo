//! What an authorization request is: the rules `GET /authorize` applies to
//! its query before anything else happens (ADR 0010 (a), (b)). Pure domain:
//! no axum, no SQL. The handler resolves the client and the redirect URI
//! first, because until both are known no error may be sent to the client;
//! everything after that is [`AuthorizeRequest::parse`].

use url::form_urlencoded;

use super::OPENID_SCOPE;
use super::codes::CodeChallenge;
use crate::clients::{Client, ClientId, Scope};

/// The longest `state` a client may send, in bytes. It is echoed in the
/// redirect, so it is bounded to keep that redirect short.
pub const MAX_STATE_LENGTH: usize = 512;

/// The longest `nonce`, in bytes: it is stored with the code and later
/// copied into the ID token.
pub const MAX_NONCE_LENGTH: usize = 512;

/// A parameter that appeared more than once. RFC 6749 §3.1: request
/// parameters MUST NOT be included more than once.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Duplicate(pub &'static str);

/// The query of an authorization request, decoded, in the order it came.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Params(Vec<(String, String)>);

impl Params {
    /// Decodes an `application/x-www-form-urlencoded` query. Decoding never
    /// fails: a malformed escape is kept as it was, and the rules below
    /// judge the result.
    pub fn from_query(query: &str) -> Self {
        Self(
            form_urlencoded::parse(query.as_bytes())
                .map(|(name, value)| (name.into_owned(), value.into_owned()))
                .collect(),
        )
    }

    /// The value of `name`. A repeated name is an error whatever its values
    /// are, and is checked first. After that an empty value is the same as
    /// no value: RFC 6749 §3.1, "parameters sent without a value MUST be
    /// treated as if they were omitted from the request".
    pub fn get(&self, name: &'static str) -> Result<Option<&str>, Duplicate> {
        let mut values = self
            .0
            .iter()
            .filter(|(candidate, _)| candidate == name)
            .map(|(_, value)| value.as_str());
        let first = values.next();
        if values.next().is_some() {
            return Err(Duplicate(name));
        }
        Ok(first.filter(|value| !value.is_empty()))
    }

    /// The first value of `name` as sent, empty or repeated, for a log line
    /// about a request that is being refused.
    pub fn first_raw(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(candidate, _)| candidate == name)
            .map(|(_, value)| value.as_str())
    }
}

/// A failure that must not be sent to the redirect URI, because the redirect
/// URI is not trusted yet (RFC 6749 §4.1.2.1: the authorization server MUST
/// NOT redirect). CAS answers these with a page of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageError {
    /// `client_id` missing, repeated, malformed or not registered. One
    /// answer for all four: telling an unknown caller which it was helps
    /// nobody but someone enumerating clients.
    UnknownClient,
    /// `redirect_uri` missing, repeated or not one the client registered.
    InvalidRedirectUri,
    /// A request too broken to name a client at all.
    MalformedRequest(&'static str),
}

/// The client a request names. See [`PageError::UnknownClient`].
pub fn client_id(params: &Params) -> Result<ClientId, PageError> {
    params
        .get("client_id")
        .ok()
        .flatten()
        .and_then(|value| ClientId::try_new(value).ok())
        .ok_or(PageError::UnknownClient)
}

/// The redirect URI a request names, if the client registered it, byte for
/// byte (ADR 0008 (c)). Required even when the client registered only one:
/// OAuth 2.1 and the security BCP require it, and every planned client
/// sends it.
pub fn redirect_uri<'p>(params: &'p Params, client: &Client) -> Result<&'p str, PageError> {
    params
        .get("redirect_uri")
        .ok()
        .flatten()
        .filter(|value| client.allows_redirect_uri(value))
        .ok_or(PageError::InvalidRedirectUri)
}

/// The `state` to echo in an error redirect: only one that was sent exactly
/// once and not empty. A request refused *for* its `state` has none to echo.
pub fn echoed_state(params: &Params) -> Option<&str> {
    params.get("state").ok().flatten()
}

/// The error codes an authorization error redirect carries: RFC 6749
/// §4.1.2.1 and OpenID Connect Core §3.1.2.6.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OAuthError {
    InvalidRequest,
    UnsupportedResponseType,
    InvalidScope,
    UnauthorizedClient,
    ServerError,
    TemporarilyUnavailable,
    LoginRequired,
    RequestNotSupported,
    RequestUriNotSupported,
    RegistrationNotSupported,
}

impl OAuthError {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::UnsupportedResponseType => "unsupported_response_type",
            Self::InvalidScope => "invalid_scope",
            Self::UnauthorizedClient => "unauthorized_client",
            Self::ServerError => "server_error",
            Self::TemporarilyUnavailable => "temporarily_unavailable",
            Self::LoginRequired => "login_required",
            Self::RequestNotSupported => "request_not_supported",
            Self::RequestUriNotSupported => "request_uri_not_supported",
            Self::RegistrationNotSupported => "registration_not_supported",
        }
    }
}

/// A failure sent back to the client through its redirect URI. The
/// description never echoes a request value except a scope token (which
/// passed the scope-token grammar) and a parameter name from a fixed set, so
/// nothing attacker-shaped is reflected into the redirect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedirectError {
    pub error: OAuthError,
    pub description: String,
}

impl RedirectError {
    pub fn new(error: OAuthError, description: impl Into<String>) -> Self {
        Self {
            error,
            description: description.into(),
        }
    }

    fn invalid_request(description: impl Into<String>) -> Self {
        Self::new(OAuthError::InvalidRequest, description)
    }
}

impl From<Duplicate> for RedirectError {
    fn from(Duplicate(name): Duplicate) -> Self {
        Self::invalid_request(format!("parameter {name} is repeated"))
    }
}

/// Every parameter [`AuthorizeRequest::parse`] reads. A repetition of any
/// of them is refused before any other rule is looked at.
const READ_PARAMETERS: [&str; 13] = [
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "nonce",
    "request",
    "request_uri",
    "registration",
    "response_mode",
    "max_age",
    "id_token_hint",
    "prompt",
];

/// The `prompt` values OpenID Connect Core §3.1.2.1 defines. Anything else
/// is named `unknown` in the refusal, so the description stays a fixed
/// string.
const PROMPT_VALUES: [&str; 3] = ["login", "consent", "select_account"];

/// A valid authorization request for a known client and a trusted redirect
/// URI: what [`crate::oidc::AuthorizationService::issue`] binds a code to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizeRequest {
    pub client_id: ClientId,
    /// Exactly as sent; `/token` compares it byte for byte.
    pub redirect_uri: String,
    /// In request order, each once.
    pub scopes: Vec<Scope>,
    pub state: String,
    pub code_challenge: CodeChallenge,
    pub nonce: Option<String>,
    /// `prompt=none`: the client promised to show no UI, so an anonymous
    /// request is answered `login_required` instead of a sign-in screen.
    pub prompt_none: bool,
}

impl AuthorizeRequest {
    /// Applies the rules of ADR 0010 (b) to a request whose client and
    /// redirect URI were resolved by [`client_id`] and [`redirect_uri`].
    /// The first rule that fails is the answer.
    pub fn parse(
        params: &Params,
        client: &Client,
        redirect_uri: &str,
    ) -> Result<Self, RedirectError> {
        for name in READ_PARAMETERS {
            params.get(name)?;
        }

        match params.get("response_type")? {
            None => return Err(RedirectError::invalid_request("response_type is required")),
            Some("code") => {}
            Some(_) => {
                return Err(RedirectError::new(
                    OAuthError::UnsupportedResponseType,
                    "only response_type=code is supported",
                ));
            }
        }

        let scopes = scopes(params.get("scope")?, client)?;

        let state = match params.get("state")? {
            None => return Err(RedirectError::invalid_request("state is required")),
            Some(state) if state.len() > MAX_STATE_LENGTH => {
                return Err(RedirectError::invalid_request("state is too long"));
            }
            Some(state) => state.to_owned(),
        };

        let code_challenge = match params.get("code_challenge")? {
            None => {
                return Err(RedirectError::invalid_request("code_challenge is required"));
            }
            Some(value) => CodeChallenge::try_new(value)
                .map_err(|_| RedirectError::invalid_request("code_challenge is malformed"))?,
        };

        if params.get("code_challenge_method")? != Some("S256") {
            return Err(RedirectError::invalid_request(
                "code_challenge_method must be S256",
            ));
        }

        let nonce = match params.get("nonce")? {
            Some(nonce) if nonce.len() > MAX_NONCE_LENGTH => {
                return Err(RedirectError::invalid_request("nonce is too long"));
            }
            nonce => nonce.map(str::to_owned),
        };

        refuse_unsupported_requirements(params)?;
        let prompt_none = prompt_none(params.get("prompt")?)?;

        Ok(Self {
            client_id: client.id.clone(),
            redirect_uri: redirect_uri.to_owned(),
            scopes,
            state,
            code_challenge,
            nonce,
            prompt_none,
        })
    }
}

/// The requested scopes: space-separated tokens (RFC 6749 §3.3), each a
/// valid scope token, `openid` among them, all inside the client's
/// allow-list. Deduplicated, in request order.
fn scopes(value: Option<&str>, client: &Client) -> Result<Vec<Scope>, RedirectError> {
    let Some(value) = value else {
        return Err(RedirectError::invalid_request("scope is required"));
    };

    let mut scopes: Vec<Scope> = Vec::new();
    for token in value.split(' ') {
        let scope = Scope::try_new(token)
            .map_err(|_| RedirectError::new(OAuthError::InvalidScope, "scope is malformed"))?;
        if !scopes.contains(&scope) {
            scopes.push(scope);
        }
    }

    if !scopes.iter().any(|scope| scope.as_str() == OPENID_SCOPE) {
        return Err(RedirectError::new(
            OAuthError::InvalidScope,
            "scope must include openid",
        ));
    }
    if let Some(refused) = scopes.iter().find(|scope| !client.allows_scope(scope)) {
        return Err(RedirectError::new(
            OAuthError::InvalidScope,
            format!("scope {refused} is not allowed for this client"),
        ));
    }

    Ok(scopes)
}

/// Parameters that state a requirement CAS cannot honour. Ignoring one would
/// hand a code to a client that asked for something else (ADR 0010 (b)).
fn refuse_unsupported_requirements(params: &Params) -> Result<(), RedirectError> {
    if params.get("request")?.is_some() {
        return Err(RedirectError::new(
            OAuthError::RequestNotSupported,
            "request objects are not supported",
        ));
    }
    if params.get("request_uri")?.is_some() {
        return Err(RedirectError::new(
            OAuthError::RequestUriNotSupported,
            "request_uri is not supported",
        ));
    }
    if params.get("registration")?.is_some() {
        return Err(RedirectError::new(
            OAuthError::RegistrationNotSupported,
            "registration is not supported",
        ));
    }
    if params
        .get("response_mode")?
        .is_some_and(|mode| mode != "query")
    {
        return Err(RedirectError::invalid_request(
            "only response_mode=query is supported",
        ));
    }
    if params.get("max_age")?.is_some() {
        return Err(RedirectError::invalid_request("max_age is not supported"));
    }
    if params.get("id_token_hint")?.is_some() {
        return Err(RedirectError::invalid_request(
            "id_token_hint is not supported yet",
        ));
    }
    Ok(())
}

/// `prompt`: absent is nothing, `none` alone is honoured, anything else is
/// refused — including `none` combined with another value, which OpenID
/// Connect Core §3.1.2.1 forbids.
fn prompt_none(value: Option<&str>) -> Result<bool, RedirectError> {
    match value {
        None => Ok(false),
        Some("none") => Ok(true),
        Some(value) => {
            let named = value
                .split(' ')
                .find_map(|token| PROMPT_VALUES.into_iter().find(|known| *known == token))
                .unwrap_or("unknown");
            Err(RedirectError::invalid_request(format!(
                "prompt={named} is not supported"
            )))
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use time::OffsetDateTime;

    use super::*;
    use crate::clients::{ClientKind, ClientName, RedirectUri};

    pub(crate) const CALLBACK: &str = "http://localhost:5173/oidc/callback";
    pub(crate) const CHALLENGE: &str = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    fn client() -> Client {
        Client {
            id: ClientId::try_new("ligretto").unwrap(),
            name: ClientName::try_new("Ligretto").unwrap(),
            kind: ClientKind::Public,
            secret_hash: None,
            redirect_uris: vec![RedirectUri::try_new(CALLBACK).unwrap()],
            post_logout_redirect_uris: vec![],
            first_party: true,
            guest_login_allowed: false,
            scopes: ["openid", "profile", "email"]
                .into_iter()
                .map(|scope| Scope::try_new(scope).unwrap())
                .collect(),
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    /// A valid request's parameters, as pairs, so a test can replace,
    /// remove or add one.
    fn valid() -> Vec<(&'static str, String)> {
        vec![
            ("client_id", "ligretto".to_owned()),
            ("redirect_uri", CALLBACK.to_owned()),
            ("response_type", "code".to_owned()),
            ("scope", "openid profile".to_owned()),
            ("state", "abc".to_owned()),
            ("code_challenge", CHALLENGE.to_owned()),
            ("code_challenge_method", "S256".to_owned()),
        ]
    }

    fn params(pairs: &[(&str, String)]) -> Params {
        Params(
            pairs
                .iter()
                .map(|(name, value)| ((*name).to_owned(), value.clone()))
                .collect(),
        )
    }

    fn with(name: &'static str, value: &str) -> Vec<(&'static str, String)> {
        let mut pairs: Vec<_> = valid().into_iter().filter(|(n, _)| *n != name).collect();
        pairs.push((name, value.to_owned()));
        pairs
    }

    fn without(name: &str) -> Vec<(&'static str, String)> {
        valid().into_iter().filter(|(n, _)| *n != name).collect()
    }

    fn plus(name: &'static str, value: &str) -> Vec<(&'static str, String)> {
        let mut pairs = valid();
        pairs.push((name, value.to_owned()));
        pairs
    }

    fn parse(pairs: &[(&str, String)]) -> Result<AuthorizeRequest, RedirectError> {
        AuthorizeRequest::parse(&params(pairs), &client(), CALLBACK)
    }

    fn refused(pairs: &[(&str, String)]) -> (OAuthError, String) {
        let error = parse(pairs).expect_err("the request must be refused");
        (error.error, error.description)
    }

    fn invalid_request(description: &str) -> (OAuthError, String) {
        (OAuthError::InvalidRequest, description.to_owned())
    }

    #[test]
    fn a_valid_request_parses() {
        let request = parse(&valid()).unwrap();

        assert_eq!(
            request,
            AuthorizeRequest {
                client_id: ClientId::try_new("ligretto").unwrap(),
                redirect_uri: CALLBACK.to_owned(),
                scopes: vec![
                    Scope::try_new("openid").unwrap(),
                    Scope::try_new("profile").unwrap()
                ],
                state: "abc".to_owned(),
                code_challenge: CodeChallenge::try_new(CHALLENGE).unwrap(),
                nonce: None,
                prompt_none: false,
            }
        );
    }

    #[test]
    fn nonce_is_optional_and_kept_when_sent() {
        assert_eq!(parse(&valid()).unwrap().nonce, None);
        assert_eq!(parse(&plus("nonce", "")).unwrap().nonce, None);
        assert_eq!(
            parse(&plus("nonce", "n-0S6")).unwrap().nonce.as_deref(),
            Some("n-0S6")
        );
        let longest = "n".repeat(MAX_NONCE_LENGTH);
        assert_eq!(
            parse(&plus("nonce", &longest)).unwrap().nonce,
            Some(longest)
        );
    }

    #[test]
    fn a_nonce_over_512_bytes_is_refused() {
        assert_eq!(
            refused(&plus("nonce", &"n".repeat(MAX_NONCE_LENGTH + 1))),
            invalid_request("nonce is too long")
        );
    }

    #[test]
    fn scopes_are_deduplicated_in_request_order() {
        let request = parse(&with("scope", "profile openid profile email openid")).unwrap();

        assert_eq!(
            request.scopes,
            ["profile", "openid", "email"]
                .map(|scope| Scope::try_new(scope).unwrap())
                .to_vec()
        );
    }

    #[test]
    fn response_type_must_be_code() {
        assert_eq!(
            refused(&without("response_type")),
            invalid_request("response_type is required")
        );
        assert_eq!(
            refused(&with("response_type", "")),
            invalid_request("response_type is required")
        );
        for other in ["token", "code id_token", "CODE"] {
            assert_eq!(
                refused(&with("response_type", other)),
                (
                    OAuthError::UnsupportedResponseType,
                    "only response_type=code is supported".to_owned()
                ),
                "{other}"
            );
        }
    }

    #[test]
    fn scope_rules() {
        assert_eq!(
            refused(&without("scope")),
            invalid_request("scope is required")
        );
        assert_eq!(
            refused(&with("scope", "")),
            invalid_request("scope is required")
        );
        assert_eq!(
            refused(&with("scope", "profile email")),
            (
                OAuthError::InvalidScope,
                "scope must include openid".to_owned()
            )
        );
        assert_eq!(
            refused(&with("scope", "openid admin")),
            (
                OAuthError::InvalidScope,
                "scope admin is not allowed for this client".to_owned()
            )
        );
        assert_eq!(
            refused(&with("scope", "openid  profile")),
            (OAuthError::InvalidScope, "scope is malformed".to_owned()),
            "two spaces leave an empty token between them"
        );
        assert_eq!(
            refused(&with("scope", "openid pro\"file")),
            (OAuthError::InvalidScope, "scope is malformed".to_owned())
        );
    }

    #[test]
    fn state_is_required_and_bounded() {
        assert_eq!(
            refused(&without("state")),
            invalid_request("state is required")
        );
        assert_eq!(
            refused(&with("state", "")),
            invalid_request("state is required"),
            "an empty value is an omitted one"
        );
        assert_eq!(
            refused(&with("state", &"s".repeat(MAX_STATE_LENGTH + 1))),
            invalid_request("state is too long")
        );
        assert!(parse(&with("state", &"s".repeat(MAX_STATE_LENGTH))).is_ok());
    }

    #[test]
    fn code_challenge_is_required_and_well_formed() {
        assert_eq!(
            refused(&without("code_challenge")),
            invalid_request("code_challenge is required")
        );
        assert_eq!(
            refused(&with("code_challenge", &"a".repeat(42))),
            invalid_request("code_challenge is malformed")
        );
        assert_eq!(
            refused(&with("code_challenge", &format!("{}+", "a".repeat(42)))),
            invalid_request("code_challenge is malformed")
        );
    }

    #[test]
    fn code_challenge_method_must_be_s256() {
        for pairs in [
            without("code_challenge_method"),
            with("code_challenge_method", "plain"),
            with("code_challenge_method", "s256"),
            with("code_challenge_method", ""),
        ] {
            assert_eq!(
                refused(&pairs),
                invalid_request("code_challenge_method must be S256"),
                "{pairs:?}"
            );
        }
    }

    #[test]
    fn an_empty_optional_parameter_is_absent() {
        let request = parse(&plus("prompt", "")).unwrap();
        assert!(!request.prompt_none);
        assert!(parse(&plus("max_age", "")).is_ok());
        assert!(parse(&plus("login_hint", "")).is_ok());
    }

    #[test]
    fn every_read_parameter_repeated_is_refused_by_name() {
        for name in READ_PARAMETERS {
            for second in ["x", ""] {
                let mut pairs = valid();
                // A parameter the valid request does not carry gets a
                // first occurrence of its own.
                if !pairs.iter().any(|(present, _)| *present == name) {
                    pairs.push((name, "x".to_owned()));
                }
                pairs.push((name, second.to_owned()));
                assert_eq!(
                    refused(&pairs),
                    invalid_request(&format!("parameter {name} is repeated")),
                    "{name} repeated with {second:?}"
                );
            }
        }
    }

    #[test]
    fn a_repetition_is_found_before_any_other_rule() {
        let mut pairs = with("response_type", "token");
        pairs.push(("state", "again".to_owned()));

        assert_eq!(
            refused(&pairs),
            invalid_request("parameter state is repeated")
        );
    }

    #[test]
    fn get_refuses_a_repeated_name_and_drops_an_empty_value() {
        let params = Params::from_query("a=1&a=2&b=&c=3&d=%20");

        assert_eq!(params.get("a"), Err(Duplicate("a")));
        assert_eq!(params.get("b"), Ok(None));
        assert_eq!(params.get("c"), Ok(Some("3")));
        assert_eq!(params.get("d"), Ok(Some(" ")));
        assert_eq!(params.get("e"), Ok(None));
        assert_eq!(Params::from_query("a=&a=1").get("a"), Err(Duplicate("a")));
    }

    #[test]
    fn unknown_parameters_and_hints_are_ignored() {
        let mut pairs = valid();
        for (name, value) in [
            ("login_hint", "ada"),
            ("display", "page"),
            ("ui_locales", "en"),
            ("acr_values", "x"),
            ("claims_locales", "en"),
            ("claims", "{}"),
            ("whatever", "1"),
            ("whatever", "2"),
        ] {
            pairs.push((name, value.to_owned()));
        }

        assert!(parse(&pairs).is_ok());
    }

    #[test]
    fn unsupported_requirements_are_refused_with_the_spec_codes() {
        for (name, value, expected) in [
            (
                "request",
                "x",
                (
                    OAuthError::RequestNotSupported,
                    "request objects are not supported",
                ),
            ),
            (
                "request_uri",
                "x",
                (
                    OAuthError::RequestUriNotSupported,
                    "request_uri is not supported",
                ),
            ),
            (
                "registration",
                "x",
                (
                    OAuthError::RegistrationNotSupported,
                    "registration is not supported",
                ),
            ),
            (
                "response_mode",
                "fragment",
                (
                    OAuthError::InvalidRequest,
                    "only response_mode=query is supported",
                ),
            ),
            (
                "max_age",
                "0",
                (OAuthError::InvalidRequest, "max_age is not supported"),
            ),
            (
                "id_token_hint",
                "x",
                (
                    OAuthError::InvalidRequest,
                    "id_token_hint is not supported yet",
                ),
            ),
        ] {
            assert_eq!(
                refused(&plus(name, value)),
                (expected.0, expected.1.to_owned()),
                "{name}"
            );
        }
        assert!(parse(&plus("response_mode", "query")).is_ok());
    }

    #[test]
    fn prompt_none_is_honoured_and_every_other_prompt_refused() {
        assert!(parse(&plus("prompt", "none")).unwrap().prompt_none);
        assert!(!parse(&valid()).unwrap().prompt_none);

        for (value, named) in [
            ("login", "login"),
            ("consent", "consent"),
            ("select_account", "select_account"),
            ("none login", "login"),
            ("none none", "unknown"),
            ("<script>", "unknown"),
        ] {
            assert_eq!(
                refused(&plus("prompt", value)),
                invalid_request(&format!("prompt={named} is not supported")),
                "{value}"
            );
        }
    }

    #[test]
    fn client_id_resolution() {
        assert_eq!(
            client_id(&params(&valid())),
            Ok(ClientId::try_new("ligretto").unwrap())
        );
        for pairs in [
            without("client_id"),
            with("client_id", ""),
            with("client_id", "Not A Slug"),
            plus("client_id", "ligretto"),
        ] {
            assert_eq!(
                client_id(&params(&pairs)),
                Err(PageError::UnknownClient),
                "{pairs:?}"
            );
        }
    }

    #[test]
    fn redirect_uri_resolution() {
        let client = client();
        assert_eq!(redirect_uri(&params(&valid()), &client), Ok(CALLBACK));
        for pairs in [
            without("redirect_uri"),
            with("redirect_uri", ""),
            with("redirect_uri", &format!("{CALLBACK}/")),
            plus("redirect_uri", CALLBACK),
        ] {
            assert_eq!(
                redirect_uri(&params(&pairs), &client),
                Err(PageError::InvalidRedirectUri),
                "{pairs:?}"
            );
        }
    }

    #[test]
    fn only_a_single_non_empty_state_is_echoed() {
        assert_eq!(echoed_state(&params(&valid())), Some("abc"));
        assert_eq!(echoed_state(&params(&without("state"))), None);
        assert_eq!(echoed_state(&params(&with("state", ""))), None);
        assert_eq!(echoed_state(&params(&plus("state", "abc"))), None);
    }
}
