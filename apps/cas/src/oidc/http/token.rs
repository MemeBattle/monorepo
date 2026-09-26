//! `POST /token`: the authorization code exchange (ADR 0011). Served at the
//! root with `ApiState`, outside `/api`: it is called by a client's backend
//! or by a public client, never with CAS's cookie, so neither the session
//! nor the Fetch Metadata line (ADR 0005) has anything to say about it.
//!
//! Its errors are RFC 6749 §5.2 JSON, `error` and `error_description`,
//! which is not the `ApiError` shape (`code` and `message`): OAuth clients
//! read the former, so the endpoint has its own error type here.

use std::borrow::Cow;

use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use serde_json::json;
use tower_http::set_header::SetResponseHeaderLayer;

use crate::db::Failure;
use crate::http::ApiState;
use crate::oidc::{IssuedTokens, Params, TokenError};

/// The largest body a token request may have. The longest legitimate one —
/// a code, a verifier of 128 characters, a redirect URI and a client's
/// credentials — is well under a kilobyte; the bound is what stops a
/// client from making CAS buffer anything larger.
const MAX_BODY_BYTES: usize = 8 * 1024;

/// RFC 6749 §3.2: the token endpoint takes a form.
const FORM_CONTENT_TYPE: &str = "application/x-www-form-urlencoded";

/// What a client that tried the `Basic` scheme is told (RFC 6749 §5.2,
/// RFC 7617 §2).
const BASIC_CHALLENGE: &str = "Basic realm=\"cas\"";

/// `POST /token`, holding `ApiState`. Any other method is answered `405`
/// by the router, `HEAD` and `GET` included.
///
/// Every answer is `Cache-Control: no-store` and `Pragma: no-cache`, the
/// two headers RFC 6749 §5.1 requires on a response that carries tokens;
/// route layers, so the root's fallback is not wrapped (see
/// `oidc::http::router`).
pub fn token_router(state: ApiState) -> Router {
    Router::new()
        .route("/token", post(token))
        .route_layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .route_layer(SetResponseHeaderLayer::overriding(
            header::PRAGMA,
            HeaderValue::from_static("no-cache"),
        ))
        .with_state(state)
}

async fn token(State(state): State<ApiState>, headers: HeaderMap, body: Body) -> Response {
    match exchange(&state, &headers, body).await {
        Ok(tokens) => success(tokens),
        Err(error) => OAuthErrorResponse::from(error).into_response(),
    }
}

/// Reads the request and hands it to the service. The content type is
/// checked before the body is read, and the body is read within its bound.
async fn exchange(
    state: &ApiState,
    headers: &HeaderMap,
    body: Body,
) -> Result<IssuedTokens, TokenError> {
    if !is_form(headers) {
        return Err(TokenError::InvalidRequest(
            "the body must be application/x-www-form-urlencoded",
        ));
    }
    let authorization = authorization(headers)?;
    let body = to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|_| TokenError::InvalidRequest("the body is too large or unreadable"))?;
    state
        .tokens
        .exchange(&Params::from_form(&body), authorization)
        .await
}

/// Whether the media type is a form, whatever its parameters (a `charset`
/// is common and harmless).
fn is_form(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|media_type| media_type.trim().eq_ignore_ascii_case(FORM_CONTENT_TYPE))
}

/// The `Authorization` header, if there is exactly one. Two are a request
/// that tried the header and cannot be read: `invalid_client`, with the
/// challenge.
fn authorization(headers: &HeaderMap) -> Result<Option<&[u8]>, TokenError> {
    let mut values = headers.get_all(header::AUTHORIZATION).iter();
    let first = values.next().map(HeaderValue::as_bytes);
    if values.next().is_some() {
        return Err(TokenError::InvalidClient { basic: true });
    }
    Ok(first)
}

/// RFC 6749 §5.1. The two headers come from the router's layers.
fn success(tokens: IssuedTokens) -> Response {
    Json(json!({
        "access_token": tokens.access_token,
        "token_type": "Bearer",
        "expires_in": tokens.expires_in,
        "refresh_token": tokens.refresh_token.expose(),
        "id_token": tokens.id_token,
        "scope": tokens.scope,
    }))
    .into_response()
}

/// An RFC 6749 §5.2 error response. `description` is a fixed string whose
/// only variable part, if any, is a parameter name from the service's fixed
/// list: nothing the request carried is reflected.
#[derive(Debug)]
struct OAuthErrorResponse {
    status: StatusCode,
    error: &'static str,
    description: Cow<'static, str>,
    /// `WWW-Authenticate: Basic`, for a client that tried the header.
    challenge: bool,
}

impl OAuthErrorResponse {
    fn new(
        status: StatusCode,
        error: &'static str,
        description: impl Into<Cow<'static, str>>,
    ) -> Self {
        Self {
            status,
            error,
            description: description.into(),
            challenge: false,
        }
    }

    fn bad_request(error: &'static str, description: impl Into<Cow<'static, str>>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, error, description)
    }
}

/// The client's refusals are `400`, `invalid_client` is `401`. A database
/// failure borrows the two codes RFC 6749 §4.1.2.1 defines for the
/// authorization endpoint, as `/authorize` does: §5.2 has none, and a
/// client can act on "try again" as opposed to "this is broken".
impl From<TokenError> for OAuthErrorResponse {
    fn from(error: TokenError) -> Self {
        match error {
            TokenError::InvalidRequest(description) => {
                Self::bad_request("invalid_request", description)
            }
            TokenError::Repeated(name) => {
                Self::bad_request("invalid_request", format!("parameter {name} is repeated"))
            }
            TokenError::InvalidClient { basic } => Self {
                challenge: basic,
                ..Self::new(
                    StatusCode::UNAUTHORIZED,
                    "invalid_client",
                    "client authentication failed",
                )
            },
            TokenError::InvalidGrant(description) => {
                Self::bad_request("invalid_grant", description)
            }
            TokenError::UnsupportedGrantType => Self::bad_request(
                "unsupported_grant_type",
                "only grant_type=authorization_code is supported",
            ),
            TokenError::Db(error) => database_error(&error),
            TokenError::Random(error) => {
                tracing::error!(error = %error, "no randomness for a refresh token");
                server_error()
            }
        }
    }
}

fn database_error(error: &sqlx::Error) -> OAuthErrorResponse {
    let response = match crate::db::classify(error) {
        Some(Failure::Unavailable | Failure::Busy) => OAuthErrorResponse::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "temporarily_unavailable",
            "the service is unavailable, try again later",
        ),
        None => server_error(),
    };
    tracing::error!(error = response.error, source = ?error, "token request failed");
    response
}

fn server_error() -> OAuthErrorResponse {
    OAuthErrorResponse::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "server_error",
        "the server could not complete the request",
    )
}

impl IntoResponse for OAuthErrorResponse {
    fn into_response(self) -> Response {
        if self.status.is_client_error() {
            tracing::debug!(error = self.error, "token request refused");
        }
        let body = Json(json!({
            "error": self.error,
            "error_description": self.description,
        }));
        if self.challenge {
            let challenge = [(
                header::WWW_AUTHENTICATE,
                HeaderValue::from_static(BASIC_CHALLENGE),
            )];
            (self.status, challenge, body).into_response()
        } else {
            (self.status, body).into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use axum::http::Request;
    use base64::Engine;
    use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
    use openidconnect::core::{
        CoreIdToken, CoreIdTokenVerifier, CoreJsonWebKey, CoreJsonWebKeySet,
        CoreJwsSigningAlgorithm,
    };
    use openidconnect::{IssuerUrl, JsonWebKey, JsonWebKeyId, Nonce};
    use sqlx::PgPool;
    use sqlx::postgres::PgPoolOptions;
    use tower::ServiceExt;
    use url::{Url, form_urlencoded};
    use uuid::Uuid;

    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::clients::{
        Audience, ClientId, ClientName, ClientRepository, ClientSecret, NewClient, RedirectUri,
        Scope,
    };
    use crate::oidc::authorization::tests::{CALLBACK, CHALLENGE};
    use crate::oidc::http::tests::discover;
    use crate::oidc::http::{Documents, authorize_router, router as documents_router};
    use crate::oidc::{Discovery, RefreshToken, SigningKeys};
    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{
        DEV_SIGNING_KEY, DEV_SIGNING_KEY_KID, capture_tracing, display_name, test_config,
        test_cookies, test_state,
    };

    /// RFC 7636 Appendix B: the verifier of [`CHALLENGE`].
    const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const OTHER_VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl";
    const NONCE: &str = "n-0S6_WzA2Mj";
    /// A confidential client whose tokens are for a resource of another
    /// name, as ligretto's backend will be.
    const CONFIDENTIAL: &str = "ligretto-core";
    const AUDIENCE: &str = "ligretto";
    const PUBLIC: &str = "ligretto-web";

    /// What `http::app` serves at the root for OIDC, on the test's pool.
    fn router(pool: PgPool) -> Router {
        let state = test_state(pool);
        let keys = SigningKeys::from_pem(DEV_SIGNING_KEY).unwrap();
        Router::new()
            .merge(documents_router(Documents {
                discovery: Discovery::for_issuer(&test_config().issuer),
                jwks: keys.jwks(),
            }))
            .merge(authorize_router(state.clone()))
            .merge(token_router(state))
    }

    fn scopes(values: &[&str]) -> Vec<Scope> {
        values
            .iter()
            .map(|value| Scope::try_new(*value).unwrap())
            .collect()
    }

    /// A signed-in account, a confidential and a public first-party client,
    /// and the router in front of them.
    struct Fixture {
        router: Router,
        pool: PgPool,
        secret: ClientSecret,
        account_id: Uuid,
        cookie: String,
    }

    async fn fixture(pool: &PgPool) -> Fixture {
        let clients = ClientRepository::new(pool.clone());
        let secret = ClientSecret::generate().unwrap();
        let allowed = scopes(&["openid", "profile", "email"]);
        clients
            .create(
                NewClient::confidential(
                    ClientId::try_new(CONFIDENTIAL).unwrap(),
                    ClientName::try_new("Ligretto").unwrap(),
                    secret.hash(),
                    vec![RedirectUri::try_new(CALLBACK).unwrap()],
                )
                .unwrap()
                .first_party(true)
                .with_scopes(allowed.clone())
                .with_audience(Audience::try_new(AUDIENCE).unwrap()),
            )
            .await
            .unwrap();
        clients
            .create(
                NewClient::public(
                    ClientId::try_new(PUBLIC).unwrap(),
                    ClientName::try_new("Ligretto web").unwrap(),
                    vec![RedirectUri::try_new(CALLBACK).unwrap()],
                )
                .unwrap()
                .first_party(true)
                .with_scopes(allowed),
            )
            .await
            .unwrap();
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();
        let session = SessionService::new(pool.clone())
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        Fixture {
            router: router(pool.clone()),
            pool: pool.clone(),
            secret,
            account_id: account.id,
            cookie: format!("{}={}", test_cookies().name(), session.token.expose()),
        }
    }

    impl Fixture {
        /// A code from `/authorize` for `client_id`, the way a signed-in
        /// browser gets one.
        async fn code(&self, client_id: &str, scope: &str) -> String {
            let query = form(&[
                ("client_id", client_id),
                ("redirect_uri", CALLBACK),
                ("response_type", "code"),
                ("scope", scope),
                ("state", "s"),
                ("code_challenge", CHALLENGE),
                ("code_challenge_method", "S256"),
                ("nonce", NONCE),
            ]);
            let response = self
                .router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/authorize?{query}"))
                        .header(header::COOKIE, &self.cookie)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FOUND);
            let location = response.headers()[header::LOCATION].to_str().unwrap();
            Url::parse(location)
                .unwrap()
                .query_pairs()
                .find(|(name, _)| name == "code")
                .map(|(_, value)| value.into_owned())
                .expect("a code in the redirect")
        }

        /// The confidential client's `Authorization: Basic` value.
        fn basic(&self) -> String {
            basic(CONFIDENTIAL, self.secret.expose())
        }

        /// `POST /token` with a form body and, optionally, an
        /// `Authorization` header.
        async fn token(&self, pairs: &[(&str, &str)], authorization: Option<&str>) -> Response {
            send(
                &self.router,
                Some(FORM_CONTENT_TYPE),
                authorization,
                form(pairs),
            )
            .await
        }

        /// The confidential client exchanging `code` with Basic.
        async fn exchange(&self, code: &str) -> Response {
            self.token(&grant(code), Some(&self.basic())).await
        }

        async fn jwks(&self) -> CoreJsonWebKeySet {
            discover(self.router.clone()).await.jwks().clone()
        }

        /// An ID token verifier for `client_id` configured the way a client
        /// library configures one: from the discovered metadata, the key
        /// set and the signing algorithms included.
        async fn id_token_verifier(
            &self,
            client_id: &str,
            secret: Option<&str>,
        ) -> CoreIdTokenVerifier<'static> {
            let metadata = discover(self.router.clone()).await;
            let client_id = openidconnect::ClientId::new(client_id.to_owned());
            let jwks = metadata.jwks().clone();
            let verifier = match secret {
                Some(secret) => CoreIdTokenVerifier::new_confidential_client(
                    client_id,
                    openidconnect::ClientSecret::new(secret.to_owned()),
                    issuer(),
                    jwks,
                ),
                None => CoreIdTokenVerifier::new_public_client(client_id, issuer(), jwks),
            };
            verifier.set_allowed_algs(metadata.id_token_signing_alg_values_supported().clone())
        }
    }

    fn form(pairs: &[(&str, &str)]) -> String {
        form_urlencoded::Serializer::new(String::new())
            .extend_pairs(pairs)
            .finish()
    }

    fn basic(id: &str, secret: &str) -> String {
        format!("Basic {}", STANDARD.encode(format!("{id}:{secret}")))
    }

    /// A form's pairs, in order.
    type Pairs<'a> = Vec<(&'a str, &'a str)>;

    /// An authorization code grant with everything a request needs but the
    /// client's credentials.
    fn grant(code: &str) -> Pairs<'_> {
        vec![
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", CALLBACK),
            ("code_verifier", VERIFIER),
        ]
    }

    fn plus<'a>(mut pairs: Pairs<'a>, name: &'a str, value: &'a str) -> Pairs<'a> {
        pairs.push((name, value));
        pairs
    }

    fn with<'a>(pairs: Pairs<'a>, name: &'a str, value: &'a str) -> Pairs<'a> {
        plus(without(pairs, name), name, value)
    }

    fn without<'a>(pairs: Pairs<'a>, name: &str) -> Pairs<'a> {
        pairs.into_iter().filter(|(n, _)| *n != name).collect()
    }

    async fn send(
        router: &Router,
        content_type: Option<&str>,
        authorization: Option<&str>,
        body: String,
    ) -> Response {
        let mut request = Request::builder().method("POST").uri("/token");
        if let Some(content_type) = content_type {
            request = request.header(header::CONTENT_TYPE, content_type);
        }
        if let Some(authorization) = authorization {
            request = request.header(header::AUTHORIZATION, authorization);
        }
        router
            .clone()
            .oneshot(request.body(Body::from(body)).unwrap())
            .await
            .unwrap()
    }

    fn header_str(response: &Response, name: header::HeaderName) -> Option<&str> {
        response
            .headers()
            .get(name)
            .map(|value| value.to_str().unwrap())
    }

    async fn json(response: Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    /// A refusal: the status, the RFC 6749 §5.2 body, and the headers every
    /// answer of the endpoint carries.
    async fn assert_error(
        response: Response,
        status: StatusCode,
        error: &str,
    ) -> serde_json::Value {
        assert_eq!(response.status(), status, "{error}");
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        assert_eq!(header_str(&response, header::PRAGMA), Some("no-cache"));
        let body = json(response).await;
        assert_eq!(body["error"], error, "{body}");
        assert!(body["error_description"].is_string(), "{body}");
        assert_eq!(body.as_object().unwrap().len(), 2, "{body}");
        body
    }

    async fn assert_invalid_grant(response: Response) {
        assert_error(response, StatusCode::BAD_REQUEST, "invalid_grant").await;
    }

    /// A JWS's decoded header and claims, once its signature has verified
    /// against the key the router publishes under its `kid`.
    fn decode(jws: &str, jwks: &CoreJsonWebKeySet) -> (serde_json::Value, serde_json::Value) {
        let segments: Vec<&str> = jws.split('.').collect();
        let [header, claims, signature] = segments[..] else {
            panic!("a compact JWS: {jws}");
        };
        let header: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(header).unwrap()).unwrap();
        let kid = JsonWebKeyId::new(header["kid"].as_str().unwrap().to_owned());
        let key: &CoreJsonWebKey = jwks
            .keys()
            .iter()
            .find(|key| key.key_id() == Some(&kid))
            .expect("the kid names a published key");
        key.verify_signature(
            &CoreJwsSigningAlgorithm::EcdsaP256Sha256,
            format!("{}.{claims}", segments[0]).as_bytes(),
            &URL_SAFE_NO_PAD.decode(signature).unwrap(),
        )
        .expect("the signature verifies against the JWKS");
        let claims = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(claims).unwrap()).unwrap();
        (header, claims)
    }

    fn issuer() -> IssuerUrl {
        IssuerUrl::new(test_config().issuer).unwrap()
    }

    async fn grants(pool: &PgPool) -> Vec<(Uuid, Option<time::OffsetDateTime>)> {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_as("SELECT id, revoked_at FROM grants")
            .fetch_all(pool)
            .await
            .unwrap()
    }

    /// The acceptance criterion: a code becomes the token triple, and the
    /// access token verifies against the JWKS with the expected claims.
    #[sqlx::test]
    async fn a_confidential_client_with_basic_gets_the_tokens(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid profile email").await;

        let response = fixture.exchange(&code).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        assert_eq!(header_str(&response, header::PRAGMA), Some("no-cache"));
        assert_eq!(
            header_str(&response, header::CONTENT_TYPE),
            Some("application/json")
        );
        let body = json(response).await;
        let mut members: Vec<&str> = body
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        members.sort_unstable();
        assert_eq!(
            members,
            [
                "access_token",
                "expires_in",
                "id_token",
                "refresh_token",
                "scope",
                "token_type"
            ]
        );
        assert_eq!(body["token_type"], "Bearer");
        assert_eq!(body["expires_in"], 600);
        assert_eq!(body["scope"], "openid profile email");

        let jwks = fixture.jwks().await;
        let (header, claims) = decode(body["access_token"].as_str().unwrap(), &jwks);
        assert_eq!(
            header,
            serde_json::json!({"alg": "ES256", "typ": "at+jwt", "kid": DEV_SIGNING_KEY_KID})
        );
        assert_eq!(claims["iss"], test_config().issuer);
        assert_eq!(claims["sub"], fixture.account_id.to_string());
        assert_eq!(claims["aud"], AUDIENCE);
        assert_eq!(claims["client_id"], CONFIDENTIAL);
        assert_eq!(claims["scope"], "openid profile email");
        assert_eq!(claims["amr"], serde_json::json!(["webauthn"]));
        assert_eq!(claims["account_type"], "full");
        let iat = claims["iat"].as_i64().unwrap();
        assert_eq!(claims["exp"].as_i64().unwrap() - iat, 600);
        assert!((time::OffsetDateTime::now_utc().unix_timestamp() - iat).abs() < 60);
        let jti: Uuid = claims["jti"].as_str().unwrap().parse().unwrap();
        assert_eq!(jti.get_version_num(), 4);
        assert_eq!(claims.as_object().unwrap().len(), 10, "{claims}");

        // The ID token, checked by an independent implementation: issuer,
        // audience, expiry, signature against the discovered JWKS, nonce.
        let id_token: CoreIdToken = body["id_token"].as_str().unwrap().parse().unwrap();
        let verifier = fixture
            .id_token_verifier(CONFIDENTIAL, Some(fixture.secret.expose()))
            .await;
        let verified = id_token
            .claims(&verifier, &Nonce::new(NONCE.to_owned()))
            .expect("the ID token verifies");
        assert_eq!(verified.subject().as_str(), fixture.account_id.to_string());
        assert_eq!(
            verified
                .name()
                .and_then(|name| name.get(None))
                .map(|name| name.as_str()),
            Some("Ada")
        );
        assert_eq!(
            verified.email().map(|email| email.as_str()),
            Some("ada@example.com")
        );
        assert_eq!(verified.email_verified(), Some(false));
        assert_eq!(
            verified
                .auth_method_refs()
                .map(|amr| amr.iter().map(|value| value.as_str()).collect::<Vec<_>>()),
            Some(vec!["webauthn"])
        );
        assert!(
            id_token
                .claims(&verifier, &Nonce::new("another".to_owned()))
                .is_err(),
            "another nonce must not verify"
        );
        let (id_header, id_claims) = decode(body["id_token"].as_str().unwrap(), &jwks);
        assert_eq!(id_header["typ"], "JWT");
        assert_eq!(id_claims["aud"], CONFIDENTIAL);
        assert_eq!(id_claims["account_type"], "full");

        // The refresh token: opaque, stored as its hash under a new grant
        // bound to the code, for the code's scopes.
        let refresh = RefreshToken::parse(body["refresh_token"].as_str().unwrap())
            .expect("a refresh token of the issued shape");
        // Unchecked query: see docs/TESTS.md.
        let (account_id, client_id, scopes, linked): (Uuid, String, Vec<String>, bool) =
            sqlx::query_as(
                "SELECT g.account_id, g.client_id, g.scopes, g.authorization_code_id IS NOT NULL
                 FROM refresh_tokens t JOIN grants g ON g.id = t.grant_id
                 WHERE t.token_hash = $1",
            )
            .bind(refresh.hash().as_bytes())
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(account_id, fixture.account_id);
        assert_eq!(client_id, CONFIDENTIAL);
        assert_eq!(scopes, ["openid", "profile", "email"]);
        assert!(linked);
    }

    #[sqlx::test]
    async fn a_confidential_client_with_post_credentials_gets_the_tokens(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        let pairs = plus(
            plus(grant(&code), "client_id", CONFIDENTIAL),
            "client_secret",
            fixture.secret.expose(),
        );

        let response = fixture.token(&pairs, None).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(json(response).await["scope"], "openid");
    }

    /// A public client presents its id and the verifier, nothing else. Its
    /// audience is its own id, and with `openid` alone the ID token carries
    /// neither the name nor the address.
    #[sqlx::test]
    async fn a_public_client_gets_the_tokens_with_its_verifier_alone(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(PUBLIC, "openid").await;

        let response = fixture
            .token(&plus(grant(&code), "client_id", PUBLIC), None)
            .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = json(response).await;
        let jwks = fixture.jwks().await;
        let (_, access) = decode(body["access_token"].as_str().unwrap(), &jwks);
        assert_eq!(access["aud"], PUBLIC);
        assert_eq!(access["client_id"], PUBLIC);

        let id_token: CoreIdToken = body["id_token"].as_str().unwrap().parse().unwrap();
        let verifier = fixture.id_token_verifier(PUBLIC, None).await;
        let verified = id_token
            .claims(&verifier, &Nonce::new(NONCE.to_owned()))
            .expect("the ID token verifies");
        assert!(verified.name().is_none());
        assert!(verified.email().is_none());
        assert!(verified.email_verified().is_none());
    }

    /// `profile` without `email`: the name, not the address.
    #[sqlx::test]
    async fn the_id_token_carries_what_the_scopes_release(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid profile").await;

        let body = json(fixture.exchange(&code).await).await;

        let (_, claims) = decode(body["id_token"].as_str().unwrap(), &fixture.jwks().await);
        assert_eq!(claims["name"], "Ada");
        assert_eq!(claims["nonce"], NONCE);
        assert!(claims.get("email").is_none(), "{claims}");
        assert!(claims.get("auth_time").is_none(), "{claims}");
    }

    #[sqlx::test]
    async fn client_authentication_failures_are_invalid_client(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        let secret = fixture.secret.expose();

        // (pairs, Authorization, whether the Basic challenge is expected)
        let wrong_basic = basic(CONFIDENTIAL, "wrong");
        let unknown_basic = basic("nobody", secret);
        let public_basic = basic(PUBLIC, secret);
        let cases: Vec<(Pairs, Option<&str>, bool)> = vec![
            (grant(&code), Some(&wrong_basic), true),
            (grant(&code), Some(&unknown_basic), true),
            (grant(&code), Some(&public_basic), true),
            (grant(&code), Some("Basic !!!"), true),
            (grant(&code), Some("Bearer abc"), true),
            (grant(&code), None, false),
            (plus(grant(&code), "client_id", CONFIDENTIAL), None, false),
            (
                plus(
                    plus(grant(&code), "client_id", CONFIDENTIAL),
                    "client_secret",
                    "wrong",
                ),
                None,
                false,
            ),
            (
                plus(
                    plus(grant(&code), "client_id", PUBLIC),
                    "client_secret",
                    secret,
                ),
                None,
                false,
            ),
            (
                plus(
                    plus(grant(&code), "client_id", "nobody"),
                    "client_secret",
                    secret,
                ),
                None,
                false,
            ),
        ];

        for (pairs, authorization, challenge) in cases {
            let response = fixture.token(&pairs, authorization).await;
            let www_authenticate =
                header_str(&response, header::WWW_AUTHENTICATE).map(str::to_owned);

            assert_error(response, StatusCode::UNAUTHORIZED, "invalid_client").await;
            assert_eq!(
                www_authenticate.as_deref(),
                challenge.then_some(BASIC_CHALLENGE),
                "{pairs:?} {authorization:?}"
            );
        }

        // The client is authenticated before the grant is looked at: none
        // of the refusals above touched the code.
        assert_eq!(fixture.exchange(&code).await.status(), StatusCode::OK);
    }

    #[sqlx::test]
    async fn two_authorization_headers_are_invalid_client(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        let request = Request::builder()
            .method("POST")
            .uri("/token")
            .header(header::CONTENT_TYPE, FORM_CONTENT_TYPE)
            .header(header::AUTHORIZATION, fixture.basic())
            .header(header::AUTHORIZATION, fixture.basic())
            .body(Body::from(form(&grant(&code))))
            .unwrap();

        let response = fixture.router.clone().oneshot(request).await.unwrap();

        assert_eq!(
            header_str(&response, header::WWW_AUTHENTICATE),
            Some(BASIC_CHALLENGE)
        );
        assert_error(response, StatusCode::UNAUTHORIZED, "invalid_client").await;
    }

    #[sqlx::test]
    async fn malformed_requests_are_invalid_request(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        let basic = fixture.basic();

        for (pairs, description) in [
            (
                plus(grant(&code), "client_secret", fixture.secret.expose()),
                "the client authenticated with more than one method",
            ),
            (
                without(grant(&code), "grant_type"),
                "grant_type is required",
            ),
            (without(grant(&code), "code"), "code is required"),
            (
                without(grant(&code), "redirect_uri"),
                "redirect_uri is required",
            ),
            (
                without(grant(&code), "code_verifier"),
                "code_verifier is required",
            ),
            (
                with(grant(&code), "code_verifier", "short"),
                "code_verifier is malformed",
            ),
            (
                plus(grant(&code), "code", &code),
                "parameter code is repeated",
            ),
        ] {
            let response = fixture.token(&pairs, Some(&basic)).await;

            let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
            assert_eq!(body["error_description"], description, "{pairs:?}");
        }

        // Nothing above reached the code.
        assert_eq!(fixture.exchange(&code).await.status(), StatusCode::OK);
    }

    #[sqlx::test]
    async fn only_the_authorization_code_grant_is_supported(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;

        for grant_type in [
            "refresh_token",
            crate::oidc::GUEST_GRANT_TYPE,
            "client_credentials",
            "password",
        ] {
            let response = fixture
                .token(
                    &with(grant(&code), "grant_type", grant_type),
                    Some(&fixture.basic()),
                )
                .await;

            assert_error(response, StatusCode::BAD_REQUEST, "unsupported_grant_type").await;
        }
    }

    #[sqlx::test]
    async fn a_code_of_the_wrong_shape_is_invalid_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;

        assert_invalid_grant(fixture.exchange("not-a-code").await).await;
        assert_invalid_grant(fixture.exchange(&"A".repeat(43)).await).await;
    }

    /// The code is consumed before the verifier is checked: a wrong
    /// verifier burns it (RFC 7636 §4.6), and nothing is issued.
    #[sqlx::test]
    async fn a_wrong_verifier_is_invalid_grant_and_burns_the_code(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;

        let response = fixture
            .token(
                &with(grant(&code), "code_verifier", OTHER_VERIFIER),
                Some(&fixture.basic()),
            )
            .await;

        let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_grant").await;
        assert_eq!(
            body["error_description"],
            "code_verifier does not match the code_challenge"
        );
        assert_invalid_grant(fixture.exchange(&code).await).await;
        assert!(grants(&pool).await.is_empty());
    }

    #[sqlx::test]
    async fn a_code_for_another_redirect_uri_is_invalid_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        let elsewhere = format!("{CALLBACK}/");

        let response = fixture
            .token(
                &with(grant(&code), "redirect_uri", &elsewhere),
                Some(&fixture.basic()),
            )
            .await;

        assert_invalid_grant(response).await;
    }

    /// Another client, however well it authenticates, cannot redeem a code
    /// issued to this one; the code is burnt all the same.
    #[sqlx::test]
    async fn a_code_presented_by_another_client_is_invalid_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(PUBLIC, "openid").await;

        assert_invalid_grant(fixture.exchange(&code).await).await;
        let rightful = fixture
            .token(&plus(grant(&code), "client_id", PUBLIC), None)
            .await;
        assert_invalid_grant(rightful).await;
    }

    #[sqlx::test]
    async fn an_expired_code_is_invalid_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE authorization_codes SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();

        assert_invalid_grant(fixture.exchange(&code).await).await;
    }

    /// RFC 6749 §4.1.2: a code used twice revokes what the first use
    /// produced, and the second use gets nothing.
    #[sqlx::test]
    async fn a_replayed_code_is_invalid_grant_and_revokes_the_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        assert_eq!(fixture.exchange(&code).await.status(), StatusCode::OK);
        let other_code = fixture.code(CONFIDENTIAL, "openid").await;
        assert_eq!(fixture.exchange(&other_code).await.status(), StatusCode::OK);
        let (events, _guard) = capture_tracing();

        assert_invalid_grant(fixture.exchange(&code).await).await;

        let grants = grants(&pool).await;
        assert_eq!(grants.len(), 2, "the replay created nothing");
        assert_eq!(
            grants
                .iter()
                .filter(|(_, revoked)| revoked.is_some())
                .count(),
            1,
            "only the grant of the replayed code: {grants:?}"
        );
        let [warning] = &events.mentioning("grants revoked")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(warning.starts_with("WARN"), "{warning}");
        assert!(warning.contains("revoked=1"), "{warning}");
    }

    /// The code goes with the account, so a deleted account leaves nothing
    /// to redeem.
    #[sqlx::test]
    async fn a_code_of_a_deleted_account_is_invalid_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(fixture.account_id)
            .execute(&pool)
            .await
            .unwrap();

        assert_invalid_grant(fixture.exchange(&code).await).await;
    }

    /// A row altered outside CAS is a bug, not a grant: `server_error`, and
    /// nothing is issued.
    #[sqlx::test]
    async fn a_corrupted_stored_scope_is_a_server_error(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE authorization_codes SET scopes = ARRAY['openid', 'bad scope']")
            .execute(&pool)
            .await
            .unwrap();

        let response = fixture.exchange(&code).await;

        assert_error(response, StatusCode::INTERNAL_SERVER_ERROR, "server_error").await;
        assert!(grants(&fixture.pool).await.is_empty());
    }

    /// A database that does not answer while the client is looked up.
    #[tokio::test]
    async fn an_unavailable_database_is_temporarily_unavailable() {
        let pool = PgPoolOptions::new()
            .acquire_timeout(Duration::from_secs(1))
            .connect_lazy("postgres://cas:cas@localhost:1/cas")
            .unwrap();
        let router = token_router(test_state(pool));
        let body = form(&plus(grant("x"), "client_id", PUBLIC));

        let response = send(&router, Some(FORM_CONTENT_TYPE), None, body).await;

        assert_error(
            response,
            StatusCode::SERVICE_UNAVAILABLE,
            "temporarily_unavailable",
        )
        .await;
    }

    /// No query is made for a request that is not a form, so the lazy pool
    /// of the test state is never used.
    #[tokio::test]
    async fn a_body_that_is_not_a_form_is_invalid_request() {
        let router = token_router(test_state(
            PgPoolOptions::new()
                .connect_lazy("postgres://cas:cas@localhost:1/cas")
                .unwrap(),
        ));
        let body = form(&grant("x"));

        for content_type in [None, Some("application/json"), Some("text/plain")] {
            let response = send(&router, content_type, None, body.clone()).await;

            let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
            assert_eq!(
                body["error_description"],
                "the body must be application/x-www-form-urlencoded"
            );
        }

        let too_large = "a".repeat(MAX_BODY_BYTES + 1);
        let response = send(&router, Some(FORM_CONTENT_TYPE), None, too_large).await;
        assert_error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
    }

    #[test]
    fn a_form_with_a_charset_is_a_form() {
        for value in [
            "application/x-www-form-urlencoded",
            "application/x-www-form-urlencoded; charset=UTF-8",
            "Application/X-WWW-Form-Urlencoded",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(value).unwrap());
            assert!(is_form(&headers), "{value}");
        }
    }

    /// Through the whole application: the endpoint is mounted at the root,
    /// for `POST` only, and a request that is not a form is refused before
    /// any query (the pool of `app` points at no test database).
    #[tokio::test]
    async fn the_endpoint_is_mounted_at_the_root_for_post_only() {
        let app = crate::http::app(test_config()).unwrap();

        for method in ["GET", "HEAD", "PUT"] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri("/token")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                StatusCode::METHOD_NOT_ALLOWED,
                "{method}"
            );
        }

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/token")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
    }

    /// Neither the code, the verifier, the client secret nor any token
    /// reaches a log line, on success or on refusal.
    #[sqlx::test]
    async fn no_secret_is_logged(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid profile email").await;
        let (events, _guard) = capture_tracing();

        let body = json(fixture.exchange(&code).await).await;
        fixture.exchange(&code).await;
        let wrong_verifier = fixture.code(CONFIDENTIAL, "openid").await;
        fixture
            .token(
                &with(grant(&wrong_verifier), "code_verifier", OTHER_VERIFIER),
                Some(&fixture.basic()),
            )
            .await;
        fixture
            .token(
                &plus(
                    plus(grant(&code), "client_id", CONFIDENTIAL),
                    "client_secret",
                    "wrong-secret",
                ),
                None,
            )
            .await;

        let [issued] = &events.mentioning("tokens issued")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(issued.contains(CONFIDENTIAL), "{issued}");
        assert!(issued.contains(&fixture.account_id.to_string()), "{issued}");
        assert!(events.contains("client authentication failed"));
        assert!(events.contains("code_verifier does not match"));
        let secrets = [
            code.as_str(),
            wrong_verifier.as_str(),
            VERIFIER,
            OTHER_VERIFIER,
            fixture.secret.expose(),
            "wrong-secret",
            body["access_token"].as_str().unwrap(),
            body["id_token"].as_str().unwrap(),
            body["refresh_token"].as_str().unwrap(),
        ];
        for event in events.all() {
            for secret in secrets {
                assert!(!event.contains(secret), "{secret} logged: {event}");
            }
        }
    }
}
