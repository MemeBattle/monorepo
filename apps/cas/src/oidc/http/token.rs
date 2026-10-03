//! `POST /token`: the authorization code exchange and the refresh (ADR 0011,
//! ADR 0012), and the guest grant (ADR 0014). Served at the
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
/// client from making CAS buffer anything larger. `POST /end_session` reads
/// its form within the same bound.
pub(super) const MAX_BODY_BYTES: usize = 8 * 1024;

/// RFC 6749 §3.2: the token endpoint takes a form.
pub(super) const FORM_CONTENT_TYPE: &str = "application/x-www-form-urlencoded";

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
pub(super) fn is_form(headers: &HeaderMap) -> bool {
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
pub(super) struct OAuthErrorResponse {
    status: StatusCode,
    pub(super) error: &'static str,
    description: Cow<'static, str>,
    /// `WWW-Authenticate: Basic`, for a client that tried the header.
    challenge: bool,
    /// `Retry-After`, in seconds, for a refusal that a later request may
    /// not get.
    retry_after: Option<u64>,
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
            retry_after: None,
        }
    }

    fn bad_request(error: &'static str, description: impl Into<Cow<'static, str>>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, error, description)
    }
}

/// The client's refusals are `400`, `invalid_client` is `401`, and the
/// guest grant's rate limit `429` with `Retry-After`: RFC 6749 §5.2 has no
/// code for it, and an extension grant may define its own. A database
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
            TokenError::InvalidScope(description) => {
                Self::bad_request("invalid_scope", description)
            }
            TokenError::UnauthorizedClient => Self::bad_request(
                "unauthorized_client",
                "the client is not authorized to use this grant type",
            ),
            TokenError::RateLimited { retry_after } => Self {
                retry_after: Some(retry_after.as_secs()),
                ..Self::new(
                    StatusCode::TOO_MANY_REQUESTS,
                    "rate_limit_exceeded",
                    "too many guest accounts were requested, try again later",
                )
            },
            TokenError::UnsupportedGrantType => {
                Self::bad_request("unsupported_grant_type", UNSUPPORTED_GRANT_TYPE)
            }
            TokenError::Db(error) => database_error(&error),
            TokenError::Random(error) => {
                tracing::error!(error = %error, "no randomness for a refresh token");
                server_error()
            }
        }
    }
}

/// The `unsupported_grant_type` description: the grants that are served.
const UNSUPPORTED_GRANT_TYPE: &str = "only grant_type=authorization_code, refresh_token and \
     urn:memebattle:oauth:grant-type:guest are supported";

fn database_error(error: &sqlx::Error) -> OAuthErrorResponse {
    let response = database_failure(error);
    tracing::error!(error = response.error, source = ?error, "token request failed");
    response
}

/// The answer to a database failure, which `/userinfo` gives too: "try
/// again" when [`crate::db::classify`] names it retryable, "this is
/// broken" otherwise.
pub(super) fn database_failure(error: &sqlx::Error) -> OAuthErrorResponse {
    match crate::db::classify(error) {
        Some(Failure::Unavailable | Failure::Busy) => OAuthErrorResponse::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "temporarily_unavailable",
            "the service is unavailable, try again later",
        ),
        None => server_error(),
    }
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
        let mut response = (self.status, body).into_response();
        if self.challenge {
            response.headers_mut().insert(
                header::WWW_AUTHENTICATE,
                HeaderValue::from_static(BASIC_CHALLENGE),
            );
        }
        if let Some(seconds) = self.retry_after {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from(seconds));
        }
        response
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
    use crate::clients::registration::register;
    use crate::clients::{
        Audience, ClientId, ClientKind, ClientName, ClientRepository, ClientSecret,
        GuestGrantsPerMinute, NewClient, RedirectUri, Registration,
    };
    use crate::oidc::authorization::tests::{CALLBACK, CHALLENGE};
    use crate::oidc::http::tests::discover;
    use crate::oidc::http::{Documents, authorize_router, router as documents_router};
    use crate::oidc::token_request::INVALID_REFRESH_TOKEN;
    use crate::oidc::{Discovery, GUEST_GRANT_TYPE, RefreshToken, SigningKeys};
    use crate::sessions::{SessionOrigin, SessionService, SessionToken};
    use crate::testing::{
        DEV_SIGNING_KEY, DEV_SIGNING_KEY_KID, capture_tracing, display_name, header_str, scopes,
        test_config, test_cookies, test_state,
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

    /// A signed-in account, a confidential and a public first-party client,
    /// and the router in front of them.
    struct Fixture {
        router: Router,
        pool: PgPool,
        secret: ClientSecret,
        account_id: Uuid,
        cookie: String,
        /// The session's token, for a test that signs the account out.
        session: SessionToken,
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
            session: session.token,
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

        /// A refresh token of the confidential client, from a fresh code
        /// for `scope`.
        async fn refresh_token(&self, scope: &str) -> String {
            let code = self.code(CONFIDENTIAL, scope).await;
            let response = self.exchange(&code).await;
            assert_eq!(response.status(), StatusCode::OK);
            json(response).await["refresh_token"]
                .as_str()
                .unwrap()
                .to_owned()
        }

        /// The confidential client refreshing `token` with Basic, with
        /// `extra` pairs after the grant's.
        async fn refresh(&self, token: &str, extra: &[(&str, &str)]) -> Response {
            let mut pairs = refresh(token);
            pairs.extend_from_slice(extra);
            self.token(&pairs, Some(&self.basic())).await
        }

        /// [`Self::refresh`] that must succeed: the body.
        async fn refreshed(&self, token: &str) -> serde_json::Value {
            let response = self.refresh(token, &[]).await;
            assert_eq!(response.status(), StatusCode::OK);
            json(response).await
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

    /// A refresh token grant, without the client's credentials.
    fn refresh(token: &str) -> Pairs<'_> {
        vec![("grant_type", "refresh_token"), ("refresh_token", token)]
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
    async fn other_grant_types_are_unsupported(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;

        for grant_type in [
            "client_credentials",
            "password",
            "urn:memebattle:oauth:grant-type:anonymous",
        ] {
            let response = fixture
                .token(
                    &with(grant(&code), "grant_type", grant_type),
                    Some(&fixture.basic()),
                )
                .await;

            let body =
                assert_error(response, StatusCode::BAD_REQUEST, "unsupported_grant_type").await;
            assert_eq!(body["error_description"], UNSUPPORTED_GRANT_TYPE);
            assert_eq!(
                body["error_description"],
                "only grant_type=authorization_code, refresh_token and \
                 urn:memebattle:oauth:grant-type:guest are supported"
            );
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

    /// Logout does not erase the replay signal: the redeemed code outlives
    /// the session that authorized it, so presenting it again after the
    /// account signed out of CAS still revokes the grant it produced.
    #[sqlx::test]
    async fn a_code_replayed_after_logout_still_revokes_the_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        assert_eq!(fixture.exchange(&code).await.status(), StatusCode::OK);

        let revoked = SessionService::new(pool.clone())
            .revoke(&fixture.session)
            .await
            .unwrap();
        assert!(revoked.is_some(), "the session was live");

        assert_invalid_grant(fixture.exchange(&code).await).await;
        let grants = grants(&pool).await;
        assert_eq!(grants.len(), 1);
        assert!(grants[0].1.is_some(), "the grant is revoked: {grants:?}");
    }

    /// Logout still voids a code nobody has redeemed yet.
    #[sqlx::test]
    async fn a_pending_code_is_void_after_logout(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        SessionService::new(pool.clone())
            .revoke(&fixture.session)
            .await
            .unwrap();

        assert_invalid_grant(fixture.exchange(&code).await).await;
        assert!(grants(&pool).await.is_empty());
    }

    /// Waits until a backend of this test's database is blocked on a lock
    /// while running a statement that contains `statement`, or until
    /// `finished` says there is nothing left to wait for. Bounded, so a
    /// broken assumption fails the test instead of hanging it.
    async fn wait_for_lock_wait(pool: &PgPool, statement: &str, finished: impl Fn() -> bool) {
        wait_for_lock_waits(pool, statement, 1, finished).await;
    }

    /// [`wait_for_lock_wait`] for `backends` backends at once.
    async fn wait_for_lock_waits(
        pool: &PgPool,
        statement: &str,
        backends: i64,
        finished: impl Fn() -> bool,
    ) {
        for _ in 0..200 {
            if finished() {
                return;
            }
            // Unchecked query: see docs/TESTS.md.
            let waiting: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM pg_stat_activity
                 WHERE datname = current_database()
                   AND state = 'active'
                   AND wait_event_type = 'Lock'
                   AND position($1 in query) > 0",
            )
            .bind(statement)
            .fetch_one(pool)
            .await
            .unwrap();
            if waiting >= backends {
                return;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!("fewer than {backends} backends waited on a lock in {statement:?} within 5 seconds");
    }

    /// The race a replay used to win: the first exchange has consumed the
    /// code but not yet written its grant when the replay arrives. Holding
    /// the account's row lock pauses the first exchange exactly there — the
    /// grant's foreign key check waits for it — and the replay is sent
    /// while it is paused. The replay waits on the code's row lock until the
    /// first exchange commits, and then revokes the grant it finds.
    #[sqlx::test]
    async fn a_replay_racing_the_exchange_still_revokes_its_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        let exchange = |router: Router, body: String, basic: String| {
            tokio::spawn(
                async move { send(&router, Some(FORM_CONTENT_TYPE), Some(&basic), body).await },
            )
        };
        let body = form(&grant(&code));

        let mut blocker = pool.begin().await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("SELECT id FROM accounts WHERE id = $1 FOR UPDATE")
            .bind(fixture.account_id)
            .execute(&mut *blocker)
            .await
            .unwrap();

        let first = exchange(fixture.router.clone(), body.clone(), fixture.basic());
        wait_for_lock_wait(&pool, "INSERT INTO grants", || first.is_finished()).await;
        assert!(
            !first.is_finished(),
            "the first exchange waits for the account"
        );
        let replay = exchange(fixture.router.clone(), body, fixture.basic());
        // A replay that does not wait for the first exchange — what this
        // test guards against — finishes here instead, and the assertions
        // below catch it.
        wait_for_lock_wait(&pool, "UPDATE authorization_codes", || replay.is_finished()).await;
        blocker.rollback().await.unwrap();

        let first = first.await.unwrap();
        let replay = replay.await.unwrap();
        assert_eq!(first.status(), StatusCode::OK);
        assert_invalid_grant(replay).await;
        let grants = grants(&pool).await;
        assert_eq!(grants.len(), 1, "the replay created nothing");
        assert!(grants[0].1.is_some(), "the grant is revoked: {grants:?}");
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

    /// A refresh token's row: its grant, when it was used, its expiry.
    async fn token_row(
        pool: &PgPool,
        token: &str,
    ) -> (Uuid, Option<time::OffsetDateTime>, time::OffsetDateTime) {
        let hash = RefreshToken::parse(token).unwrap().hash();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_as(
            "SELECT grant_id, used_at, expires_at FROM refresh_tokens WHERE token_hash = $1",
        )
        .bind(hash.as_bytes())
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn refresh_token_count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM refresh_tokens")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// The only grant of the test.
    async fn the_grant(pool: &PgPool) -> Uuid {
        let grants = grants(pool).await;
        let [(id, _)] = grants[..] else {
            panic!("one grant: {grants:?}");
        };
        id
    }

    /// The first acceptance criterion: a refresh answers a new set — a new
    /// refresh token among it — and retires the one presented; the
    /// successor is under the same grant, with the same fixed expiry.
    #[sqlx::test]
    async fn a_refresh_rotates_the_token_and_issues_a_new_set(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let presented = fixture.refresh_token("openid profile email").await;
        let grant_id = the_grant(&pool).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE grants SET last_used_at = created_at - interval '1 hour'")
            .execute(&pool)
            .await
            .unwrap();

        let response = fixture.refresh(&presented, &[]).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        assert_eq!(header_str(&response, header::PRAGMA), Some("no-cache"));
        let body = json(response).await;
        assert_eq!(body.as_object().unwrap().len(), 6, "{body}");
        assert_eq!(body["token_type"], "Bearer");
        assert_eq!(body["expires_in"], 600);
        assert_eq!(body["scope"], "openid profile email");
        let successor = body["refresh_token"].as_str().unwrap();
        assert_ne!(successor, presented);
        assert!(RefreshToken::parse(successor).is_some());

        let jwks = fixture.jwks().await;
        let (header, claims) = decode(body["access_token"].as_str().unwrap(), &jwks);
        assert_eq!(header["typ"], "at+jwt");
        assert_eq!(claims["sub"], fixture.account_id.to_string());
        assert_eq!(claims["aud"], AUDIENCE);
        assert_eq!(claims["client_id"], CONFIDENTIAL);
        assert_eq!(claims["scope"], "openid profile email");

        // The ID token verifies as any other, and carries no nonce: there
        // was no authorization request to take one from.
        let id_token: CoreIdToken = body["id_token"].as_str().unwrap().parse().unwrap();
        let verifier = fixture
            .id_token_verifier(CONFIDENTIAL, Some(fixture.secret.expose()))
            .await;
        let verified = id_token
            .claims(&verifier, |nonce: Option<&Nonce>| match nonce {
                None => Ok(()),
                Some(_) => Err("a refreshed ID token has no nonce".to_owned()),
            })
            .expect("the ID token verifies");
        assert_eq!(verified.subject().as_str(), fixture.account_id.to_string());
        assert_eq!(
            verified.email().map(|email| email.as_str()),
            Some("ada@example.com")
        );
        let (_, id_claims) = decode(body["id_token"].as_str().unwrap(), &jwks);
        assert!(id_claims.get("nonce").is_none(), "{id_claims}");

        let (presented_grant, used_at, _) = token_row(&pool, &presented).await;
        assert_eq!(presented_grant, grant_id);
        assert!(used_at.is_some(), "the presented token is retired");
        let (successor_grant, successor_used, successor_expiry) = token_row(&pool, successor).await;
        assert_eq!(successor_grant, grant_id);
        assert_eq!(successor_used, None);
        // Unchecked query: see docs/TESTS.md.
        let (expires_at, created_at, last_used_at): (
            time::OffsetDateTime,
            time::OffsetDateTime,
            time::OffsetDateTime,
        ) = sqlx::query_as("SELECT expires_at, created_at, last_used_at FROM grants")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(successor_expiry, expires_at, "rotation never moves the cap");
        assert_eq!(expires_at - created_at, time::Duration::days(30));
        assert!(last_used_at >= created_at, "last_used_at moved");
    }

    /// The chain continues from the successor, and the presented token is
    /// dead.
    #[sqlx::test]
    async fn the_old_refresh_token_no_longer_works(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let first = fixture.refresh_token("openid").await;

        let second = fixture.refreshed(&first).await["refresh_token"]
            .as_str()
            .unwrap()
            .to_owned();
        let third = fixture.refreshed(&second).await["refresh_token"]
            .as_str()
            .unwrap()
            .to_owned();

        assert_eq!(refresh_token_count(&pool).await, 3);
        assert_eq!(token_row(&pool, &third).await.0, the_grant(&pool).await);
        let body = assert_error(
            fixture.refresh(&first, &[]).await,
            StatusCode::BAD_REQUEST,
            "invalid_grant",
        )
        .await;
        assert_eq!(body["error_description"], INVALID_REFRESH_TOKEN);
    }

    /// The second acceptance criterion: a retired token presented again
    /// revokes the grant, and the token its rotation issued dies with it.
    #[sqlx::test]
    async fn a_reused_refresh_token_revokes_the_grant(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let first = fixture.refresh_token("openid").await;
        let second = fixture.refreshed(&first).await["refresh_token"]
            .as_str()
            .unwrap()
            .to_owned();
        let grant_id = the_grant(&pool).await;
        let (events, _guard) = capture_tracing();

        assert_invalid_grant(fixture.refresh(&first, &[]).await).await;

        assert!(grants(&pool).await[0].1.is_some(), "the grant is revoked");
        let [warning] = &events.mentioning("refresh token reused")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(warning.starts_with("WARN"), "{warning}");
        assert!(warning.contains(&grant_id.to_string()), "{warning}");
        assert!(warning.contains("revoked=true"), "{warning}");

        assert_invalid_grant(fixture.refresh(&second, &[]).await).await;
        assert_eq!(token_row(&pool, &second).await.1, None);
        assert_eq!(refresh_token_count(&pool).await, 2, "nothing was issued");
    }

    /// A grant has no session: signing out of CAS leaves it alive.
    #[sqlx::test]
    async fn a_refresh_survives_signing_out_of_cas(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;
        let revoked = SessionService::new(pool.clone())
            .revoke(&fixture.session)
            .await
            .unwrap();
        assert!(revoked.is_some(), "the session was live");

        assert_eq!(fixture.refresh(&token, &[]).await.status(), StatusCode::OK);
    }

    /// The grant's expiry, or the token's, ends the chain; nothing is
    /// written.
    #[sqlx::test]
    async fn an_expired_grant_cannot_be_refreshed(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE grants SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();

        assert_invalid_grant(fixture.refresh(&token, &[]).await).await;
        assert_eq!(token_row(&pool, &token).await.1, None);
        assert_eq!(refresh_token_count(&pool).await, 1);

        let other = fixture.refresh_token("openid").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE refresh_tokens SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();
        assert_invalid_grant(fixture.refresh(&other, &[]).await).await;
        assert_eq!(token_row(&pool, &other).await.1, None);
        assert_eq!(refresh_token_count(&pool).await, 2);
    }

    #[sqlx::test]
    async fn a_revoked_grant_cannot_be_refreshed(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE grants SET revoked_at = now()")
            .execute(&pool)
            .await
            .unwrap();

        assert_invalid_grant(fixture.refresh(&token, &[]).await).await;
        assert_eq!(token_row(&pool, &token).await.1, None);
        assert_eq!(refresh_token_count(&pool).await, 1);
    }

    /// Another client, however well it authenticates, cannot refresh this
    /// one's token, and the attempt costs the rightful client nothing.
    #[sqlx::test]
    async fn a_refresh_token_of_another_client_is_invalid_grant_and_changes_nothing(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;
        let (events, _guard) = capture_tracing();

        let response = fixture
            .token(&plus(refresh(&token), "client_id", PUBLIC), None)
            .await;

        let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_grant").await;
        assert_eq!(body["error_description"], INVALID_REFRESH_TOKEN);
        assert!(events.contains("refresh token presented by another client"));
        assert_eq!(token_row(&pool, &token).await.1, None);
        assert_eq!(grants(&pool).await[0].1, None, "the grant is not revoked");
        assert_eq!(fixture.refresh(&token, &[]).await.status(), StatusCode::OK);
    }

    /// A refresh may name the grant's scopes, or fewer, and gets them all
    /// back; it may not name more (ADR 0012 (c)).
    #[sqlx::test]
    async fn the_refresh_scope_may_repeat_or_narrow_but_not_widen(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid profile").await;

        let response = fixture
            .refresh(&token, &[("scope", "profile openid")])
            .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = json(response).await;
        assert_eq!(body["scope"], "openid profile");
        let token = body["refresh_token"].as_str().unwrap().to_owned();

        let response = fixture.refresh(&token, &[("scope", "openid")]).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = json(response).await;
        assert_eq!(body["scope"], "openid profile");
        let (_, claims) = decode(
            body["access_token"].as_str().unwrap(),
            &fixture.jwks().await,
        );
        assert_eq!(claims["scope"], "openid profile");
        let token = body["refresh_token"].as_str().unwrap().to_owned();

        for (scope, description) in [
            (
                "openid email",
                "the requested scope exceeds the scope of the grant",
            ),
            ("open\"id", "scope is malformed"),
        ] {
            let response = fixture.refresh(&token, &[("scope", scope)]).await;

            let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_scope").await;
            assert_eq!(body["error_description"], description, "{scope}");
        }
        assert_eq!(token_row(&pool, &token).await.1, None, "not retired");
        assert_eq!(fixture.refresh(&token, &[]).await.status(), StatusCode::OK);
    }

    #[sqlx::test]
    async fn refresh_request_errors(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;
        let authorization = fixture.basic();

        for (pairs, description) in [
            (
                without(refresh(&token), "refresh_token"),
                "refresh_token is required",
            ),
            (
                plus(refresh(&token), "refresh_token", &token),
                "parameter refresh_token is repeated",
            ),
            (
                plus(plus(refresh(&token), "scope", "openid"), "scope", "openid"),
                "parameter scope is repeated",
            ),
        ] {
            let response = fixture.token(&pairs, Some(&authorization)).await;

            let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
            assert_eq!(body["error_description"], description, "{pairs:?}");
        }

        let unknown = RefreshToken::generate().unwrap();
        for presented in ["not-a-token", unknown.expose()] {
            let body = assert_error(
                fixture.refresh(presented, &[]).await,
                StatusCode::BAD_REQUEST,
                "invalid_grant",
            )
            .await;
            assert_eq!(body["error_description"], INVALID_REFRESH_TOKEN);
        }

        // Authentication precedes the grant.
        let response = fixture.token(&refresh(&token), None).await;
        assert_error(response, StatusCode::UNAUTHORIZED, "invalid_client").await;
        let wrong = basic(CONFIDENTIAL, "wrong");
        let response = fixture.token(&refresh(&token), Some(&wrong)).await;
        assert_error(response, StatusCode::UNAUTHORIZED, "invalid_client").await;

        // Nothing above reached the token.
        assert_eq!(token_row(&pool, &token).await.1, None);
        assert_eq!(fixture.refresh(&token, &[]).await.status(), StatusCode::OK);
    }

    #[sqlx::test]
    async fn a_public_client_refreshes_with_its_id_alone(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(PUBLIC, "openid").await;
        let response = fixture
            .token(&plus(grant(&code), "client_id", PUBLIC), None)
            .await;
        assert_eq!(response.status(), StatusCode::OK);
        let token = json(response).await["refresh_token"]
            .as_str()
            .unwrap()
            .to_owned();

        let response = fixture
            .token(&plus(refresh(&token), "client_id", PUBLIC), None)
            .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = json(response).await;
        let (_, access) = decode(
            body["access_token"].as_str().unwrap(),
            &fixture.jwks().await,
        );
        assert_eq!(access["aud"], PUBLIC);
        assert_eq!(access["client_id"], PUBLIC);
    }

    /// The path the guest upgrade (#747) takes: every grant of the account
    /// revoked on the caller's transaction, and its refresh tokens dead once
    /// it commits.
    #[sqlx::test]
    async fn revoking_the_accounts_grants_stops_its_refreshes(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let first = fixture.refresh_token("openid").await;
        let second = fixture.refresh_token("openid").await;

        let mut tx = pool.begin().await.unwrap();
        let revoked = crate::oidc::revoke_account_grants(&mut *tx, fixture.account_id)
            .await
            .unwrap();
        tx.commit().await.unwrap();

        assert_eq!(revoked, 2);
        assert_invalid_grant(fixture.refresh(&first, &[]).await).await;
        assert_invalid_grant(fixture.refresh(&second, &[]).await).await;
    }

    /// Two refreshes with one token, at once: the row lock serialises them
    /// and the second is a reuse, which revokes the grant (ADR 0012 (b)).
    #[sqlx::test]
    async fn concurrent_refreshes_with_one_token_let_one_win(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;

        let (first, second) =
            tokio::join!(fixture.refresh(&token, &[]), fixture.refresh(&token, &[]));

        let mut statuses = [first.status(), second.status()];
        statuses.sort();
        assert_eq!(statuses, [StatusCode::OK, StatusCode::BAD_REQUEST]);
        let refused = if first.status() == StatusCode::OK {
            second
        } else {
            first
        };
        assert_invalid_grant(refused).await;
        assert!(grants(&pool).await[0].1.is_some(), "the grant is revoked");
    }

    /// Spawns a refresh of `token` by the confidential client.
    fn spawn_refresh(fixture: &Fixture, token: &str) -> tokio::task::JoinHandle<Response> {
        let router = fixture.router.clone();
        let basic = fixture.basic();
        let body = form(&refresh(token));
        tokio::spawn(
            async move { send(&router, Some(FORM_CONTENT_TYPE), Some(&basic), body).await },
        )
    }

    /// Opens a transaction that holds the grant's row lock.
    async fn hold_grant(
        pool: &PgPool,
        grant_id: Uuid,
    ) -> sqlx::Transaction<'static, sqlx::Postgres> {
        let mut blocker = pool.begin().await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("SELECT id FROM grants WHERE id = $1 FOR UPDATE")
            .bind(grant_id)
            .execute(&mut *blocker)
            .await
            .unwrap();
        blocker
    }

    /// A text only the refresh's locking read of the grant contains.
    const GRANT_LOCK_STATEMENT: &str = "revoked_at IS NOT NULL AS";

    /// A revocation that holds the grant while a refresh arrives: the
    /// refresh waits for it and then sees the grant revoked, so it issues
    /// nothing.
    #[sqlx::test]
    async fn a_refresh_waiting_on_a_revocation_sees_it(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;
        let grant_id = the_grant(&pool).await;
        let mut blocker = hold_grant(&pool, grant_id).await;

        let refreshing = spawn_refresh(&fixture, &token);
        wait_for_lock_wait(&pool, GRANT_LOCK_STATEMENT, || refreshing.is_finished()).await;
        assert!(!refreshing.is_finished(), "the refresh waits for the grant");
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE grants SET revoked_at = now() WHERE id = $1")
            .bind(grant_id)
            .execute(&mut *blocker)
            .await
            .unwrap();
        blocker.commit().await.unwrap();

        assert_invalid_grant(refreshing.await.unwrap()).await;
        assert_eq!(refresh_token_count(&pool).await, 1, "no successor");
        assert_eq!(token_row(&pool, &token).await.1, None);
    }

    /// A delete of the grant — the cascade an account deletion takes —
    /// racing a refresh: both lock the grant first, so the refresh waits,
    /// finds nothing, and answers `invalid_grant` rather than a deadlock.
    #[sqlx::test]
    async fn a_refresh_racing_a_grant_delete_does_not_deadlock(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.refresh_token("openid").await;
        let grant_id = the_grant(&pool).await;
        let mut blocker = hold_grant(&pool, grant_id).await;

        let refreshing = spawn_refresh(&fixture, &token);
        wait_for_lock_wait(&pool, GRANT_LOCK_STATEMENT, || refreshing.is_finished()).await;
        assert!(!refreshing.is_finished(), "the refresh waits for the grant");
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM grants WHERE id = $1")
            .bind(grant_id)
            .execute(&mut *blocker)
            .await
            .unwrap();
        blocker.commit().await.unwrap();

        assert_invalid_grant(refreshing.await.unwrap()).await;
        assert_eq!(refresh_token_count(&pool).await, 0);
    }

    /// No refresh token, presented or issued, reaches a log line, on
    /// success or on reuse.
    #[sqlx::test]
    async fn no_refresh_token_is_logged(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let (events, _guard) = capture_tracing();
        let first = fixture.refresh_token("openid profile email").await;

        let body = fixture.refreshed(&first).await;
        fixture.refresh(&first, &[]).await;

        let [refreshed] = &events.mentioning("tokens refreshed")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(refreshed.contains(CONFIDENTIAL), "{refreshed}");
        assert!(
            refreshed.contains(&fixture.account_id.to_string()),
            "{refreshed}"
        );
        assert!(events.contains("refresh token reused"));
        let secrets = [
            first.as_str(),
            fixture.secret.expose(),
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

    /// The client `scripts/seed-dev.sh` registers: confidential, first
    /// party, guest login allowed, `openid profile email`, audience
    /// `ligretto`, the default limit.
    const GUEST_CLIENT: &str = "ligretto";
    /// A public client registered with the flag, which the grant refuses.
    const PUBLIC_GUEST_CLIENT: &str = "ligretto-spa";
    /// The statement of the guest mint that takes the client's lock.
    const GUEST_LOCK_STATEMENT: &str = "SELECT guest_grants_per_minute FROM clients";

    /// Registers a guest-enabled client the way `cas-client` does, and
    /// returns its secret when it is confidential.
    async fn register_guest_client(
        pool: &PgPool,
        id: &str,
        kind: ClientKind,
        limit: Option<i32>,
    ) -> Option<ClientSecret> {
        register(
            pool,
            Registration {
                id: ClientId::try_new(id).unwrap(),
                name: ClientName::try_new("Ligretto").unwrap(),
                kind,
                redirect_uris: vec![
                    RedirectUri::try_new("http://localhost:5173/oidc/callback").unwrap(),
                ],
                post_logout_redirect_uris: vec![
                    RedirectUri::try_new("http://localhost:5173/").unwrap(),
                ],
                first_party: true,
                guest_login_allowed: true,
                guest_grants_per_minute: limit
                    .map(|limit| GuestGrantsPerMinute::try_new(limit).unwrap()),
                scopes: scopes(&["openid", "profile", "email"]),
                audience: Some(Audience::try_new(AUDIENCE).unwrap()),
            },
        )
        .await
        .unwrap()
        .secret
    }

    /// [`Fixture`] — whose confidential client has no guest flag — plus the
    /// seeded `ligretto` client and a public client with the flag.
    struct GuestFixture {
        base: Fixture,
        secret: ClientSecret,
    }

    async fn guest_fixture(pool: &PgPool) -> GuestFixture {
        let base = fixture(pool).await;
        let secret = register_guest_client(pool, GUEST_CLIENT, ClientKind::Confidential, None)
            .await
            .unwrap();
        register_guest_client(pool, PUBLIC_GUEST_CLIENT, ClientKind::Public, None).await;
        GuestFixture { base, secret }
    }

    fn guest() -> Pairs<'static> {
        vec![("grant_type", GUEST_GRANT_TYPE)]
    }

    impl GuestFixture {
        fn basic(&self) -> String {
            basic(GUEST_CLIENT, self.secret.expose())
        }

        /// The seeded client asking for a guest with Basic, with `extra`
        /// pairs after the grant type.
        async fn mint(&self, extra: &[(&str, &str)]) -> Response {
            let mut pairs = guest();
            pairs.extend_from_slice(extra);
            self.base.token(&pairs, Some(&self.basic())).await
        }

        /// [`Self::mint`] that must succeed: the body.
        async fn minted(&self, extra: &[(&str, &str)]) -> serde_json::Value {
            let response = self.mint(extra).await;
            assert_eq!(response.status(), StatusCode::OK);
            json(response).await
        }
    }

    /// Spawns a guest request of `client` with Basic.
    fn spawn_mint(
        router: &Router,
        client: &str,
        secret: &ClientSecret,
    ) -> tokio::task::JoinHandle<Response> {
        let router = router.clone();
        let authorization = basic(client, secret.expose());
        let body = form(&guest());
        tokio::spawn(async move {
            send(&router, Some(FORM_CONTENT_TYPE), Some(&authorization), body).await
        })
    }

    /// Opens a transaction that holds the client's row the way a guest mint
    /// does.
    async fn hold_client(
        pool: &PgPool,
        client: &str,
    ) -> sqlx::Transaction<'static, sqlx::Postgres> {
        let mut blocker = pool.begin().await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("SELECT id FROM clients WHERE id = $1 FOR NO KEY UPDATE")
            .bind(client)
            .execute(&mut *blocker)
            .await
            .unwrap();
        blocker
    }

    /// The one number a `SELECT count(*)` of the test answers.
    async fn count(pool: &PgPool, query: &'static str) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar(query).fetch_one(pool).await.unwrap()
    }

    const ACCOUNTS: &str = "SELECT count(*) FROM accounts";
    const SESSIONS: &str = "SELECT count(*) FROM sessions";

    /// The guests `client` minted.
    async fn guests_of(pool: &PgPool, client: &str) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar(
            "SELECT count(*) FROM accounts WHERE created_by_client_id = $1 AND type = 'guest'",
        )
        .bind(client)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    /// The first acceptance criterion: the seeded client gets the token
    /// triple, and its `sub` is a new guest account the client minted.
    #[sqlx::test]
    async fn the_guest_grant_mints_a_guest_account(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let sessions = count(&pool, SESSIONS).await;

        let response = fixture.mint(&[]).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        assert_eq!(header_str(&response, header::PRAGMA), Some("no-cache"));
        let body = json(response).await;
        assert_eq!(body.as_object().unwrap().len(), 6, "{body}");
        assert_eq!(body["token_type"], "Bearer");
        assert_eq!(body["expires_in"], 600);
        assert_eq!(body["scope"], "openid");

        let jwks = fixture.base.jwks().await;
        let (header, claims) = decode(body["access_token"].as_str().unwrap(), &jwks);
        assert_eq!(header["typ"], "at+jwt");
        let sub: Uuid = claims["sub"].as_str().unwrap().parse().unwrap();
        assert_eq!(claims["aud"], AUDIENCE);
        assert_eq!(claims["client_id"], GUEST_CLIENT);
        assert_eq!(claims["scope"], "openid");
        assert_eq!(claims["amr"], serde_json::json!(["anon"]));
        assert_eq!(claims["account_type"], "guest");

        // Unchecked query: see docs/TESTS.md.
        let (account_type, created_by, email): (String, Option<String>, Option<String>) =
            sqlx::query_as(
                "SELECT type::text, created_by_client_id, email FROM accounts WHERE id = $1",
            )
            .bind(sub)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(account_type, "guest");
        assert_eq!(created_by.as_deref(), Some(GUEST_CLIENT));
        assert_eq!(email, None);

        // The ID token, checked by an independent implementation, with no
        // nonce: there was no authorization request.
        let id_token: CoreIdToken = body["id_token"].as_str().unwrap().parse().unwrap();
        let verifier = fixture
            .base
            .id_token_verifier(GUEST_CLIENT, Some(fixture.secret.expose()))
            .await;
        let verified = id_token
            .claims(&verifier, |nonce: Option<&Nonce>| match nonce {
                None => Ok(()),
                Some(_) => Err("a guest's ID token has no nonce".to_owned()),
            })
            .expect("the ID token verifies");
        assert_eq!(verified.subject().as_str(), sub.to_string());
        assert!(verified.name().is_none());
        let (_, id_claims) = decode(body["id_token"].as_str().unwrap(), &jwks);
        assert_eq!(id_claims["aud"], GUEST_CLIENT);
        assert_eq!(id_claims["amr"], serde_json::json!(["anon"]));
        assert_eq!(id_claims["account_type"], "guest");
        for absent in ["nonce", "name", "email"] {
            assert!(id_claims.get(absent).is_none(), "{absent}: {id_claims}");
        }

        // A grant no code produced, with the common lifetime, and its one
        // refresh token.
        let refresh = RefreshToken::parse(body["refresh_token"].as_str().unwrap()).unwrap();
        // Unchecked query: see docs/TESTS.md.
        let (account_id, client_id, scopes, linked, created_at, expires_at): (
            Uuid,
            String,
            Vec<String>,
            bool,
            time::OffsetDateTime,
            time::OffsetDateTime,
        ) = sqlx::query_as(
            "SELECT g.account_id, g.client_id, g.scopes, g.authorization_code_id IS NOT NULL,
                    g.created_at, g.expires_at
             FROM refresh_tokens t JOIN grants g ON g.id = t.grant_id
             WHERE t.token_hash = $1",
        )
        .bind(refresh.hash().as_bytes())
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(account_id, sub);
        assert_eq!(client_id, GUEST_CLIENT);
        assert_eq!(scopes, ["openid"]);
        assert!(!linked, "no code produced the grant");
        assert_eq!(expires_at - created_at, time::Duration::days(30));
        assert_eq!(refresh_token_count(&pool).await, 1);

        // No CAS session: the guest never saw CAS.
        assert_eq!(count(&pool, SESSIONS).await, sessions);
    }

    #[sqlx::test]
    async fn a_guest_asking_for_profile_still_has_no_name(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;

        let body = fixture.minted(&[("scope", "openid profile")]).await;

        assert_eq!(body["scope"], "openid profile");
        let (_, claims) = decode(
            body["id_token"].as_str().unwrap(),
            &fixture.base.jwks().await,
        );
        assert!(claims.get("name").is_none(), "{claims}");
        assert_eq!(claims["account_type"], "guest");
    }

    #[sqlx::test]
    async fn two_guest_grants_mint_two_accounts(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let jwks = fixture.base.jwks().await;

        let first = fixture.minted(&[]).await;
        let second = fixture.minted(&[]).await;

        let (_, first) = decode(first["access_token"].as_str().unwrap(), &jwks);
        let (_, second) = decode(second["access_token"].as_str().unwrap(), &jwks);
        assert_ne!(first["sub"], second["sub"]);
        assert_eq!(guests_of(&pool, GUEST_CLIENT).await, 2);
    }

    /// Refresh is account-type agnostic: a guest's token rotates like any
    /// other, and the guest stays a guest.
    #[sqlx::test]
    async fn a_guest_refreshes_like_anyone(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let jwks = fixture.base.jwks().await;
        let minted = fixture.minted(&[]).await;
        let (_, minted_claims) = decode(minted["access_token"].as_str().unwrap(), &jwks);

        let response = fixture
            .base
            .token(
                &refresh(minted["refresh_token"].as_str().unwrap()),
                Some(&fixture.basic()),
            )
            .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = json(response).await;
        assert_ne!(body["refresh_token"], minted["refresh_token"]);
        let (_, claims) = decode(body["access_token"].as_str().unwrap(), &jwks);
        assert_eq!(claims["sub"], minted_claims["sub"]);
        assert_eq!(claims["account_type"], "guest");
        assert_eq!(claims["amr"], serde_json::json!(["anon"]));
    }

    #[sqlx::test]
    async fn the_guest_grant_takes_post_credentials_too(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let pairs = plus(
            plus(guest(), "client_id", GUEST_CLIENT),
            "client_secret",
            fixture.secret.expose(),
        );

        let response = fixture.base.token(&pairs, None).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(guests_of(&pool, GUEST_CLIENT).await, 1);
    }

    /// The second acceptance criterion, first half: a public client with
    /// the flag cannot prove who it is, so the flag does not count. Checked
    /// before the grant's own parameters.
    #[sqlx::test]
    async fn a_public_client_is_unauthorized_for_the_guest_grant(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let accounts = count(&pool, ACCOUNTS).await;

        for pairs in [
            plus(guest(), "client_id", PUBLIC_GUEST_CLIENT),
            plus(
                plus(guest(), "client_id", PUBLIC_GUEST_CLIENT),
                "scope",
                "open\"id",
            ),
        ] {
            let response = fixture.base.token(&pairs, None).await;

            let body = assert_error(response, StatusCode::BAD_REQUEST, "unauthorized_client").await;
            assert_eq!(
                body["error_description"],
                "the client is not authorized to use this grant type"
            );
        }
        assert_eq!(count(&pool, ACCOUNTS).await, accounts);
        assert!(grants(&pool).await.is_empty());
    }

    /// The second acceptance criterion, second half.
    #[sqlx::test]
    async fn a_confidential_client_without_the_flag_is_unauthorized(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let accounts = count(&pool, ACCOUNTS).await;
        let (events, _guard) = capture_tracing();

        let response = fixture
            .base
            .token(&guest(), Some(&fixture.base.basic()))
            .await;

        assert_error(response, StatusCode::BAD_REQUEST, "unauthorized_client").await;
        assert_eq!(count(&pool, ACCOUNTS).await, accounts);
        assert!(grants(&pool).await.is_empty());
        let [warning] = &events.mentioning("guest grant refused")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(warning.contains(CONFIDENTIAL), "{warning}");
    }

    /// Authentication precedes the grant, for this grant as for the others.
    #[sqlx::test]
    async fn a_wrong_secret_with_the_guest_grant_is_invalid_client(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;

        let response = fixture
            .base
            .token(&guest(), Some(&basic(GUEST_CLIENT, "wrong")))
            .await;

        assert_error(response, StatusCode::UNAUTHORIZED, "invalid_client").await;
        assert_eq!(guests_of(&pool, GUEST_CLIENT).await, 0);
    }

    #[sqlx::test]
    async fn guest_scope_errors(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;

        for (scope, description) in [
            ("profile", "scope must include openid"),
            (
                "openid offline_access",
                "the requested scope is not allowed for this client",
            ),
            ("openid  profile", "scope is malformed"),
        ] {
            let response = fixture.mint(&[("scope", scope)]).await;

            let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_scope").await;
            assert_eq!(body["error_description"], description, "{scope:?}");
        }
        let response = fixture
            .mint(&[("scope", "openid"), ("scope", "openid")])
            .await;
        let body = assert_error(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        assert_eq!(body["error_description"], "parameter scope is repeated");
        assert_eq!(guests_of(&pool, GUEST_CLIENT).await, 0);
    }

    /// The limit is per client and over a sliding minute: the request past
    /// it writes nothing and says when to come back, another client is not
    /// affected, and once the accounts have left the window the client gets
    /// a guest again.
    #[sqlx::test]
    async fn the_guest_grant_is_rate_limited_per_client(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let limited = register_guest_client(&pool, "limited", ClientKind::Confidential, Some(2))
            .await
            .unwrap();
        let pairs = guest();
        let authorization = basic("limited", limited.expose());
        let mint = || fixture.base.token(&pairs, Some(&authorization));
        assert_eq!(mint().await.status(), StatusCode::OK);
        assert_eq!(mint().await.status(), StatusCode::OK);
        let accounts = count(&pool, ACCOUNTS).await;
        let issued = refresh_token_count(&pool).await;
        let (events, _guard) = capture_tracing();

        let response = mint().await;

        assert_eq!(header_str(&response, header::RETRY_AFTER), Some("60"));
        let body = assert_error(
            response,
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limit_exceeded",
        )
        .await;
        assert_eq!(
            body["error_description"],
            "too many guest accounts were requested, try again later"
        );
        assert_eq!(count(&pool, ACCOUNTS).await, accounts);
        assert_eq!(grants(&pool).await.len(), 2);
        assert_eq!(refresh_token_count(&pool).await, issued);
        let [warning] = &events.mentioning("guest grant rate limit exceeded")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(warning.contains("limited"), "{warning}");

        assert_eq!(fixture.mint(&[]).await.status(), StatusCode::OK);

        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "UPDATE accounts SET created_at = now() - interval '61 seconds'
             WHERE created_by_client_id = 'limited'",
        )
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(mint().await.status(), StatusCode::OK);
        assert_eq!(guests_of(&pool, "limited").await, 3);
    }

    /// Two mints at the boundary of a limit of one: without the client's
    /// lock both would count zero and pass. A test transaction holds the
    /// client's row, both requests are seen waiting for it, and once it is
    /// released exactly one gets a guest.
    #[sqlx::test]
    async fn concurrent_guest_grants_respect_the_limit(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let secret = register_guest_client(&pool, "single", ClientKind::Confidential, Some(1))
            .await
            .unwrap();
        let blocker = hold_client(&pool, "single").await;

        let first = spawn_mint(&fixture.base.router, "single", &secret);
        let second = spawn_mint(&fixture.base.router, "single", &secret);
        wait_for_lock_waits(&pool, GUEST_LOCK_STATEMENT, 2, || {
            first.is_finished() || second.is_finished()
        })
        .await;
        assert!(
            !first.is_finished() && !second.is_finished(),
            "both mints wait for the client"
        );
        blocker.rollback().await.unwrap();

        let mut statuses = [
            first.await.unwrap().status(),
            second.await.unwrap().status(),
        ];
        statuses.sort();
        assert_eq!(statuses, [StatusCode::OK, StatusCode::TOO_MANY_REQUESTS]);
        assert_eq!(guests_of(&pool, "single").await, 1);
        assert_eq!(grants(&pool).await.len(), 1);
        assert_eq!(refresh_token_count(&pool).await, 1);
    }

    /// A mint delayed at the lock stamps its account with the moment it
    /// wrote it, not the moment its transaction began: otherwise the
    /// account would already be partly out of the window the next mint
    /// counts.
    #[sqlx::test]
    async fn a_guest_minted_after_a_lock_wait_is_stamped_after_the_wait(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let secret = register_guest_client(&pool, "single", ClientKind::Confidential, Some(1))
            .await
            .unwrap();
        let blocker = hold_client(&pool, "single").await;

        let minting = spawn_mint(&fixture.base.router, "single", &secret);
        wait_for_lock_wait(&pool, GUEST_LOCK_STATEMENT, || minting.is_finished()).await;
        assert!(!minting.is_finished(), "the mint waits for the client");
        // Unchecked query: see docs/TESTS.md.
        let released_at: time::OffsetDateTime = sqlx::query_scalar("SELECT clock_timestamp()")
            .fetch_one(&pool)
            .await
            .unwrap();
        blocker.rollback().await.unwrap();

        assert_eq!(minting.await.unwrap().status(), StatusCode::OK);
        // Unchecked query: see docs/TESTS.md.
        let (created_at, last_seen_at): (time::OffsetDateTime, time::OffsetDateTime) =
            sqlx::query_as(
                "SELECT created_at, last_seen_at FROM accounts WHERE created_by_client_id = 'single'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(
            created_at > released_at,
            "created_at {created_at} is before the lock was released at {released_at}"
        );
        assert_eq!(last_seen_at, created_at);

        let next = fixture
            .base
            .token(&guest(), Some(&basic("single", secret.expose())))
            .await;
        assert_error(next, StatusCode::TOO_MANY_REQUESTS, "rate_limit_exceeded").await;
    }

    /// The guest mint's lock is weaker than `FOR UPDATE`: a code exchange
    /// of the same client, whose grant insert takes `FOR KEY SHARE` on the
    /// client's row, completes while a mint holds it.
    #[sqlx::test]
    async fn a_code_exchange_is_not_queued_behind_a_guest_mint(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let code = fixture.code(CONFIDENTIAL, "openid").await;
        let blocker = hold_client(&pool, CONFIDENTIAL).await;

        let response = tokio::time::timeout(Duration::from_secs(5), fixture.exchange(&code))
            .await
            .expect("the exchange is not queued behind the client's lock");

        assert_eq!(response.status(), StatusCode::OK);
        blocker.rollback().await.unwrap();
    }

    /// No token and no secret reaches a log line; the line that records
    /// the mint names the account and the client.
    #[sqlx::test]
    async fn no_guest_token_is_logged(pool: PgPool) {
        let fixture = guest_fixture(&pool).await;
        let (events, _guard) = capture_tracing();

        let body = fixture.minted(&[("scope", "openid profile")]).await;
        let post = json(
            fixture
                .base
                .token(
                    &plus(
                        plus(guest(), "client_id", GUEST_CLIENT),
                        "client_secret",
                        fixture.secret.expose(),
                    ),
                    None,
                )
                .await,
        )
        .await;
        fixture
            .base
            .token(&guest(), Some(&basic(GUEST_CLIENT, "wrong-secret")))
            .await;

        let created = events.mentioning("guest account created");
        assert_eq!(created.len(), 2, "{:?}", events.all());
        let (_, claims) = decode(
            body["access_token"].as_str().unwrap(),
            &fixture.base.jwks().await,
        );
        let sub = claims["sub"].as_str().unwrap();
        assert!(created.iter().any(|line| line.contains(sub)), "{created:?}");
        assert!(created[0].contains(GUEST_CLIENT), "{}", created[0]);
        let secrets = [
            fixture.secret.expose(),
            "wrong-secret",
            body["access_token"].as_str().unwrap(),
            body["id_token"].as_str().unwrap(),
            body["refresh_token"].as_str().unwrap(),
            post["access_token"].as_str().unwrap(),
            post["id_token"].as_str().unwrap(),
            post["refresh_token"].as_str().unwrap(),
        ];
        for event in events.all() {
            for secret in secrets {
                assert!(!event.contains(secret), "{secret} logged: {event}");
            }
        }
    }
}
