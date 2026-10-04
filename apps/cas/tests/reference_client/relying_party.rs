//! The application's backend: a relying party built on `openidconnect`
//! alone, configured from the discovery document and its own registration.
//! Every URL it calls and every algorithm it accepts comes from the
//! document; the one request it builds by hand is the guest grant, an
//! extension grant the library has no request for.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use openidconnect::core::{
    CoreAuthDisplay, CoreAuthPrompt, CoreAuthenticationFlow, CoreClient, CoreIdToken,
    CoreIdTokenClaims, CoreJsonWebKey, CoreJwsSigningAlgorithm, CoreResponseType,
    CoreTokenResponse, CoreUserInfoClaims,
};
use openidconnect::reqwest::{self, header, redirect::Policy};
use openidconnect::url::{Url, form_urlencoded};
use openidconnect::{
    AccessToken, AuthType, AuthorizationCode, AuthorizationRequest, ClientId, ClientSecret,
    CsrfToken, EndpointMaybeSet, EndpointNotSet, EndpointSet, IssuerUrl, JsonWebKey, JsonWebKeyId,
    LogoutRequest, Nonce, PkceCodeChallenge, PkceCodeVerifier, PostLogoutRedirectUrl,
    ProviderMetadataWithLogout, RedirectUrl, RefreshToken, RequestTokenError, Scope,
    StandardErrorResponse, TokenResponse, core::CoreErrorResponseType,
};
use serde_json::Value;

/// The guest grant's type (ADR 0014). A relying party knows it from CAS's
/// documentation, not from CAS's code, so it is written out here.
pub const GUEST_GRANT_TYPE: &str = "urn:memebattle:oauth:grant-type:guest";

type Client = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;

type Request<'a> = AuthorizationRequest<'a, CoreAuthDisplay, CoreAuthPrompt, CoreResponseType>;

pub type TokenError = RequestTokenError<
    openidconnect::HttpClientError<reqwest::Error>,
    StandardErrorResponse<CoreErrorResponseType>,
>;

/// The HTTP client of a relying party's backend. It must not follow
/// redirects (the library's own requirement, against SSRF), and it ignores
/// any proxy of the environment, which would capture `127.0.0.1`.
pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .build()
        .expect("an HTTP client builds")
}

/// The library's discovery: the well-known URL derived from the issuer, the
/// issuer compared with the document's (Discovery §4.3), and the `jwks_uri`
/// fetched.
pub async fn discover(http: &reqwest::Client, issuer: &str) -> ProviderMetadataWithLogout {
    ProviderMetadataWithLogout::discover_async(
        IssuerUrl::new(issuer.to_owned()).expect("the issuer is a URL"),
        http,
    )
    .await
    .expect("discovery succeeds")
}

/// An authorization request as the relying party remembers it: the URL to
/// send the browser to, and what it keeps to check the answer.
pub struct Authorization {
    pub url: Url,
    pub state: CsrfToken,
    pub nonce: Nonce,
    pub verifier: PkceCodeVerifier,
}

pub struct RelyingParty {
    metadata: ProviderMetadataWithLogout,
    client: Client,
    client_id: String,
    secret: Option<String>,
    redirect_uri: Url,
    http: reqwest::Client,
}

impl RelyingParty {
    pub fn new(
        metadata: &ProviderMetadataWithLogout,
        client_id: &str,
        secret: Option<&str>,
        auth_type: AuthType,
        redirect_uri: &str,
    ) -> Self {
        let client = CoreClient::from_provider_metadata(
            metadata.clone(),
            ClientId::new(client_id.to_owned()),
            secret.map(|secret| ClientSecret::new(secret.to_owned())),
        )
        .set_redirect_uri(RedirectUrl::new(redirect_uri.to_owned()).expect("a valid URL"))
        .set_auth_type(auth_type);
        Self {
            metadata: metadata.clone(),
            client,
            client_id: client_id.to_owned(),
            secret: secret.map(str::to_owned),
            redirect_uri: Url::parse(redirect_uri).expect("a valid URL"),
            http: http_client(),
        }
    }

    /// An authorization code request with PKCE (S256), a fresh `state` and
    /// `nonce`, for `scopes` on top of `openid`, which the library adds.
    pub fn authorize(&self, scopes: &[&str]) -> Authorization {
        self.authorize_with(scopes, |request| request)
    }

    /// [`Self::authorize`] with whatever else `extend` adds to the request.
    pub fn authorize_with<'a>(
        &'a self,
        scopes: &[&str],
        extend: impl FnOnce(Request<'a>) -> Request<'a>,
    ) -> Authorization {
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let request = self
            .client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .add_scopes(scopes.iter().map(|scope| Scope::new((*scope).to_owned())))
            .set_pkce_challenge(challenge);
        let (url, state, nonce) = extend(request).url();
        Authorization {
            url,
            state,
            nonce,
            verifier,
        }
    }

    /// The parameters CAS sent back to the callback, after checking the
    /// redirect is to the registered `redirect_uri`, in the query, with the
    /// request's `state`.
    pub fn callback_parameters(&self, location: &Url, state: &CsrfToken) -> Vec<(String, String)> {
        let mut base = location.clone();
        base.set_query(None);
        assert_eq!(base, self.redirect_uri, "the redirect is to the callback");
        assert!(location.fragment().is_none(), "{location}");
        let parameters: Vec<(String, String)> = location
            .query_pairs()
            .map(|(name, value)| (name.into_owned(), value.into_owned()))
            .collect();
        assert_eq!(
            parameter(&parameters, "state"),
            Some(state.secret().as_str()),
            "{location} echoes the state"
        );
        parameters
    }

    /// The code of a successful callback.
    pub fn callback(&self, location: &Url, state: &CsrfToken) -> AuthorizationCode {
        let parameters = self.callback_parameters(location, state);
        assert_eq!(parameter(&parameters, "error"), None, "{location}");
        AuthorizationCode::new(
            parameter(&parameters, "code")
                .unwrap_or_else(|| panic!("{location} carries a code"))
                .to_owned(),
        )
    }

    pub async fn exchange(
        &self,
        code: AuthorizationCode,
        verifier: PkceCodeVerifier,
    ) -> CoreTokenResponse {
        self.client
            .exchange_code(code)
            .expect("the document has a token endpoint")
            .set_pkce_verifier(verifier)
            .request_async(&self.http)
            .await
            .expect("the code exchanges")
    }

    pub async fn refresh(&self, token: &RefreshToken) -> Result<CoreTokenResponse, TokenError> {
        self.client
            .exchange_refresh_token(token)
            .expect("the document has a token endpoint")
            .request_async(&self.http)
            .await
    }

    /// The ID token's claims, verified against the discovered JWKS with the
    /// algorithms the document advertises: signature, `iss`, `aud`, `exp`,
    /// and the `nonce` when the request had one; without one, the token must
    /// carry none.
    pub fn claims(&self, tokens: &CoreTokenResponse, nonce: Option<&Nonce>) -> CoreIdTokenClaims {
        let id_token = id_token(tokens);
        let verifier = self.client.id_token_verifier().set_allowed_algs(
            self.metadata
                .id_token_signing_alg_values_supported()
                .clone(),
        );
        let claims = match nonce {
            Some(nonce) => id_token.claims(&verifier, nonce),
            None => id_token.claims(&verifier, |nonce: Option<&Nonce>| match nonce {
                None => Ok(()),
                Some(_) => Err("a nonce nobody asked for".to_owned()),
            }),
        };
        claims.expect("the ID token verifies").clone()
    }

    /// The userinfo endpoint, with the library checking its `sub` against
    /// the ID token's.
    pub async fn userinfo(
        &self,
        access_token: &AccessToken,
        claims: &CoreIdTokenClaims,
    ) -> CoreUserInfoClaims {
        self.client
            .user_info(access_token.clone(), Some(claims.subject().clone()))
            .expect("the document has a userinfo endpoint")
            .request_async(&self.http)
            .await
            .expect("userinfo answers")
    }

    /// The RP-initiated logout URL, from the document's
    /// `end_session_endpoint`.
    pub fn logout_url(
        &self,
        id_token: &CoreIdToken,
        post_logout_redirect_uri: &str,
        state: &CsrfToken,
    ) -> Url {
        let endpoint = self
            .metadata
            .additional_metadata()
            .end_session_endpoint
            .clone()
            .expect("the document has an end session endpoint");
        LogoutRequest::from(endpoint)
            .set_id_token_hint(id_token)
            .set_post_logout_redirect_uri(
                PostLogoutRedirectUrl::new(post_logout_redirect_uri.to_owned())
                    .expect("a valid URL"),
            )
            .set_state(state.clone())
            .http_get_url()
    }

    /// The guest grant: the one hand-built protocol request, to the
    /// document's token endpoint with HTTP Basic credentials. The answer is
    /// read as the library's token response, so the ID token still goes
    /// through the library.
    pub async fn guest(&self) -> CoreTokenResponse {
        let secret = self
            .secret
            .as_deref()
            .expect("the guest grant is for a confidential client");
        let token_endpoint = self
            .metadata
            .token_endpoint()
            .expect("the document has a token endpoint");
        let body = form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", GUEST_GRANT_TYPE)
            .finish();
        let response = self
            .http
            .post(token_endpoint.url().clone())
            .basic_auth(&self.client_id, Some(secret))
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header(header::ACCEPT, "application/json")
            .body(body)
            .send()
            .await
            .expect("the token endpoint answers");
        let status = response.status();
        let bytes = response.bytes().await.expect("a readable body");
        assert!(
            status.is_success(),
            "the guest grant answered {status}: {}",
            String::from_utf8_lossy(&bytes)
        );
        serde_json::from_slice(&bytes).expect("a token response")
    }
}

pub fn id_token(tokens: &CoreTokenResponse) -> &CoreIdToken {
    tokens
        .id_token()
        .expect("the token response carries an ID token")
}

fn parameter<'a>(parameters: &'a [(String, String)], name: &str) -> Option<&'a str> {
    parameters
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}

/// The payload of a JWT already verified, for CAS's own claims the Core
/// claim types leave out (`account_type`).
pub fn extra_claims(jwt: &str) -> Value {
    let payload = jwt.split('.').nth(1).expect("a JWS has a payload");
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).expect("base64url"))
        .expect("a JSON payload")
}

/// What the client's resource server does with an access token (RFC 9068):
/// `typ` is `at+jwt`, `alg` one the document advertises, `kid` a key of the
/// discovered JWKS, the signature verifies with it, the `iss` is the
/// issuer's, the `aud` is `audience` and the token has not expired. Returns
/// the claims.
pub fn verify_access_token(
    metadata: &ProviderMetadataWithLogout,
    token: &AccessToken,
    audience: &str,
) -> Value {
    let jwt = token.secret();
    let (signing_input, signature) = jwt.rsplit_once('.').expect("a JWS");
    let (header, _) = signing_input.split_once('.').expect("a JWS");
    let header: Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(header).expect("base64url"))
        .expect("a JSON header");
    assert_eq!(header["typ"], "at+jwt", "{header}");

    let alg: CoreJwsSigningAlgorithm =
        serde_json::from_value(header["alg"].clone()).expect("a known alg");
    assert!(
        metadata
            .id_token_signing_alg_values_supported()
            .contains(&alg),
        "{header}: the alg is advertised"
    );
    let kid = JsonWebKeyId::new(header["kid"].as_str().expect("a kid").to_owned());
    let key: &CoreJsonWebKey = metadata
        .jwks()
        .keys()
        .iter()
        .find(|key| key.key_id() == Some(&kid))
        .expect("the kid is in the discovered JWKS");
    key.verify_signature(
        &alg,
        signing_input.as_bytes(),
        &URL_SAFE_NO_PAD.decode(signature).expect("base64url"),
    )
    .expect("the access token's signature verifies");

    let claims = extra_claims(jwt);
    assert_eq!(claims["iss"], metadata.issuer().as_str(), "{claims}");
    assert_eq!(claims["aud"], audience, "{claims}");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("after 1970")
        .as_secs();
    assert!(
        claims["exp"].as_u64().expect("a numeric exp") > now,
        "{claims}: unexpired"
    );
    claims
}

/// Whether `error` is the authorization server refusing the grant itself
/// (`invalid_grant`, RFC 6749 §5.2).
pub fn is_invalid_grant(error: &TokenError) -> bool {
    matches!(
        error,
        RequestTokenError::ServerResponse(response)
            if *response.error() == CoreErrorResponseType::InvalidGrant
    )
}
