//! `GET` and `POST /userinfo` (OpenID Connect Core §5.3): the claims of the
//! account behind a Bearer access token. Served at the root with
//! `ApiState`, outside `/api`: it reads no cookie, only the token, so
//! neither the session nor the Fetch Metadata line (ADR 0005) has anything
//! to say about it.
//!
//! Errors follow RFC 6750 §3: a `WWW-Authenticate: Bearer` challenge, with
//! the same code in a JSON body for the developer reading the response. See
//! `docs/adr/0013-userinfo-and-rp-initiated-logout.md`.

use std::time::Duration;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;

use super::token::database_failure;
use crate::http::ApiState;
use crate::oidc::UserInfoError;

/// The challenge for a request that sent no Bearer credentials: RFC 6750
/// §3.1 asks for no error code then, since the client may simply not know
/// authentication is required.
const BARE_CHALLENGE: &str = "Bearer";

/// How long a browser may cache the answer to a preflight. An hour, like
/// the discovery documents: the policy changes only with a release.
const PREFLIGHT_MAX_AGE: Duration = Duration::from_secs(60 * 60);

/// `GET` and `POST /userinfo`, holding `ApiState`. Both methods are served,
/// as Core §5.3.1 requires; a `POST` body is not read, because the token is
/// taken from the `Authorization` header only (ADR 0013 (d)).
///
/// Every answer is `no-store` (Core §5.3.2, RFC 6750 §5.3); a route layer,
/// so the root's fallback is not wrapped (see `oidc::http::router`). The
/// CORS policy is [`userinfo_cors`], which the transport root applies
/// outside this router's panic handler.
pub fn userinfo_router(state: ApiState) -> Router {
    Router::new()
        .route("/userinfo", get(userinfo).post(userinfo))
        .route_layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .with_state(state)
}

/// The CORS policy of `/userinfo`, and of nothing else: any origin, `GET`
/// and `POST`, the `Authorization` header, and never credentials. A browser
/// application may call the endpoint with a token it holds; since the
/// endpoint reads no cookie, a page on another origin can do nothing with
/// it that it could not do with that token anyway (ADR 0013 (e)). Everything
/// else, `/token` included, keeps the root's credentialed policy.
pub fn userinfo_cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .max_age(PREFLIGHT_MAX_AGE)
}

async fn userinfo(State(state): State<ApiState>, headers: HeaderMap) -> Response {
    let bearer = match bearer(&headers) {
        Ok(bearer) => bearer,
        Err(error) => return error.into_response(),
    };
    match state.userinfo.userinfo(bearer).await {
        Ok(claims) => Json(claims).into_response(),
        Err(UserInfoError::InvalidToken) => BearerError::InvalidToken.into_response(),
        Err(UserInfoError::InsufficientScope) => BearerError::InsufficientScope.into_response(),
        Err(UserInfoError::Db(error)) => database_error(&error),
    }
}

/// The access token of an `Authorization: Bearer` header (RFC 6750 §2.1):
/// the scheme, case-insensitive, one or more spaces, and a `token68` value.
/// No header, or one of another scheme, is a request without Bearer
/// credentials; two headers, or a `Bearer` header whose value is empty or
/// not `token68`, are malformed.
fn bearer(headers: &HeaderMap) -> Result<&str, BearerError> {
    let mut values = headers.get_all(header::AUTHORIZATION).iter();
    let Some(value) = values.next() else {
        return Err(BearerError::NoCredentials);
    };
    if values.next().is_some() {
        return Err(BearerError::InvalidRequest);
    }

    let value = value.as_bytes();
    let (scheme, rest) = match value.iter().position(|byte| *byte == b' ') {
        Some(space) => (&value[..space], &value[space..]),
        None => (value, &value[value.len()..]),
    };
    if !scheme.eq_ignore_ascii_case(b"Bearer") {
        return Err(BearerError::NoCredentials);
    }
    let credentials = after_spaces(rest);
    if !is_token68(credentials) {
        return Err(BearerError::InvalidRequest);
    }
    // `token68` is ASCII, so this cannot fail.
    std::str::from_utf8(credentials).map_err(|_| BearerError::InvalidRequest)
}

/// Skips the `1*SP` between the scheme and the credentials: spaces only, as
/// RFC 6750 §2.1 writes it, not other whitespace.
fn after_spaces(value: &[u8]) -> &[u8] {
    let start = value
        .iter()
        .position(|byte| *byte != b' ')
        .unwrap_or(value.len());
    &value[start..]
}

/// RFC 7235 §2.1: `token68 = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" /
/// "+" / "/" ) *"="`.
fn is_token68(value: &[u8]) -> bool {
    let body_length = value
        .iter()
        .position(|byte| {
            !(byte.is_ascii_alphanumeric()
                || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'+' | b'/'))
        })
        .unwrap_or(value.len());
    body_length > 0 && value[body_length..].iter().all(|byte| *byte == b'=')
}

/// The refusals of RFC 6750 §3.1, each with its status and challenge.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BearerError {
    /// No `Authorization` header, or one of another scheme.
    NoCredentials,
    InvalidRequest,
    InvalidToken,
    InsufficientScope,
}

impl BearerError {
    /// The status, the challenge, and the `error` and `error_description`
    /// of the body; `None` for a request without Bearer credentials, which
    /// is told nothing but the scheme.
    fn parts(
        self,
    ) -> (
        StatusCode,
        &'static str,
        Option<(&'static str, &'static str)>,
    ) {
        match self {
            Self::NoCredentials => (StatusCode::UNAUTHORIZED, BARE_CHALLENGE, None),
            Self::InvalidRequest => (
                StatusCode::BAD_REQUEST,
                r#"Bearer error="invalid_request""#,
                Some((
                    "invalid_request",
                    "the request must carry exactly one Authorization: Bearer header with a token",
                )),
            ),
            Self::InvalidToken => (
                StatusCode::UNAUTHORIZED,
                r#"Bearer error="invalid_token", error_description="the access token is invalid or expired""#,
                Some(("invalid_token", "the access token is invalid or expired")),
            ),
            Self::InsufficientScope => (
                StatusCode::FORBIDDEN,
                r#"Bearer error="insufficient_scope", scope="openid""#,
                Some((
                    "insufficient_scope",
                    "the access token does not carry the openid scope",
                )),
            ),
        }
    }
}

impl IntoResponse for BearerError {
    fn into_response(self) -> Response {
        let (status, challenge, body) = self.parts();
        tracing::debug!(
            error = body.map_or("no_credentials", |(error, _)| error),
            "userinfo request refused"
        );
        let challenge = [(
            header::WWW_AUTHENTICATE,
            HeaderValue::from_static(challenge),
        )];
        match body {
            Some((error, description)) => (
                status,
                challenge,
                Json(json!({"error": error, "error_description": description})),
            )
                .into_response(),
            None => (status, challenge).into_response(),
        }
    }
}

/// A database failure while the account is read: `/token`'s answer to
/// one, the two codes it borrows from RFC 6749 §4.1.2.1, for the same
/// reason — a client can act on "try again" as opposed to "this is
/// broken". No challenge: the token was not refused.
fn database_error(error: &sqlx::Error) -> Response {
    let response = database_failure(error);
    tracing::error!(error = response.error, source = ?error, "userinfo request failed");
    response.into_response()
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use axum::http::Request;
    use sqlx::PgPool;
    use sqlx::postgres::PgPoolOptions;
    use time::OffsetDateTime;
    use tower::ServiceExt;

    use super::*;
    use crate::accounts::{Account, AccountRepository, NewAccount};
    use crate::clients::{Audience, Client, ClientId, ClientKind, ClientName, RedirectUri};
    use crate::oidc::authorization::tests::CALLBACK;
    use crate::oidc::{SigningKey, SigningKeys};
    use crate::testing::{
        capture_tracing, display_name, fresh_signing_key_pem, header_str, register_public_client,
        scopes, signed_access_token, test_signing_key, test_state,
    };

    const CLIENT: &str = "ligretto-web";

    struct Fixture {
        router: Router,
        pool: PgPool,
        client: Client,
        account: Account,
    }

    async fn fixture(pool: &PgPool) -> Fixture {
        let client = register_public_client(pool, CLIENT, &[]).await;
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();
        Fixture {
            router: userinfo_router(test_state(pool.clone())),
            pool: pool.clone(),
            client,
            account,
        }
    }

    impl Fixture {
        /// An access token as `/token` issues it, signed by `key`.
        fn token_signed_by(
            &self,
            key: &SigningKey,
            granted: &[&str],
            issued_at: OffsetDateTime,
        ) -> String {
            signed_access_token(key, &self.client, &self.account, granted, issued_at)
        }

        /// A fresh access token for `granted`, signed by the active key.
        fn token(&self, granted: &[&str]) -> String {
            self.token_signed_by(&test_signing_key(), granted, OffsetDateTime::now_utc())
        }

        async fn get(&self, authorization: &[&str]) -> Response {
            send(&self.router, "GET", authorization).await
        }
    }

    async fn send(router: &Router, method: &str, authorization: &[&str]) -> Response {
        let mut request = Request::builder().method(method).uri("/userinfo");
        for value in authorization {
            request = request.header(header::AUTHORIZATION, *value);
        }
        router
            .clone()
            .oneshot(request.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap()
    }

    async fn json(response: Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    /// A refusal: the status, the challenge, and the body naming the same
    /// code.
    async fn assert_refused(response: Response, status: StatusCode, error: &str) {
        assert_eq!(response.status(), status, "{error}");
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        let challenge = header_str(&response, header::WWW_AUTHENTICATE)
            .expect("a challenge")
            .to_owned();
        assert!(challenge.starts_with("Bearer "), "{challenge}");
        assert!(
            challenge.contains(&format!("error=\"{error}\"")),
            "{challenge}"
        );
        let body = json(response).await;
        assert_eq!(body["error"], error, "{body}");
        assert!(body["error_description"].is_string(), "{body}");
    }

    async fn assert_bare_challenge(response: Response) {
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            header_str(&response, header::WWW_AUTHENTICATE),
            Some("Bearer")
        );
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
    }

    /// The first acceptance criterion, first half, and the claims per
    /// scope.
    #[sqlx::test]
    async fn a_valid_token_gets_the_claims_its_scopes_release(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let sub = fixture.account.id.to_string();

        let all = fixture
            .get(&[&format!(
                "Bearer {}",
                fixture.token(&["openid", "profile", "email"])
            )])
            .await;
        assert_eq!(all.status(), StatusCode::OK);
        assert_eq!(
            header_str(&all, header::CONTENT_TYPE),
            Some("application/json")
        );
        assert_eq!(header_str(&all, header::CACHE_CONTROL), Some("no-store"));
        assert_eq!(
            json(all).await,
            serde_json::json!({
                "sub": sub,
                "account_type": "full",
                "name": "Ada",
                "email": "ada@example.com",
                "email_verified": false,
            })
        );

        let openid = fixture
            .get(&[&format!("Bearer {}", fixture.token(&["openid"]))])
            .await;
        assert_eq!(openid.status(), StatusCode::OK);
        assert_eq!(
            json(openid).await,
            serde_json::json!({"sub": sub, "account_type": "full"})
        );
    }

    #[sqlx::test]
    async fn post_is_served_too(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let bearer = format!("Bearer {}", fixture.token(&["openid", "profile"]));

        let response = send(&fixture.router, "POST", &[&bearer]).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(json(response).await["name"], "Ada");
    }

    /// The first acceptance criterion, second half: a token past its `exp`
    /// is `401` with the RFC 6750 challenge.
    #[sqlx::test]
    async fn an_expired_token_is_401_invalid_token(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.token_signed_by(
            &test_signing_key(),
            &["openid"],
            OffsetDateTime::now_utc() - time::Duration::minutes(11),
        );

        let response = fixture.get(&[&format!("Bearer {token}")]).await;

        let challenge = header_str(&response, header::WWW_AUTHENTICATE)
            .unwrap()
            .to_owned();
        assert_eq!(
            challenge,
            r#"Bearer error="invalid_token", error_description="the access token is invalid or expired""#
        );
        assert_refused(response, StatusCode::UNAUTHORIZED, "invalid_token").await;
    }

    #[sqlx::test]
    async fn no_token_is_401_with_a_bare_challenge(pool: PgPool) {
        let fixture = fixture(&pool).await;

        let response = fixture.get(&[]).await;

        assert_bare_challenge(response).await;
    }

    #[sqlx::test]
    async fn another_scheme_gets_the_bare_challenge(pool: PgPool) {
        let fixture = fixture(&pool).await;

        for value in ["Basic YWRhOnNlY3JldA==", "Token abc", "Bearerabc"] {
            let response = fixture.get(&[value]).await;
            assert_bare_challenge(response).await;
        }
    }

    #[sqlx::test]
    async fn a_malformed_authorization_header_is_400(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let bearer = format!("Bearer {}", fixture.token(&["openid"]));

        let twice = fixture.get(&[&bearer, &bearer]).await;
        assert_refused(twice, StatusCode::BAD_REQUEST, "invalid_request").await;

        for value in [
            "Bearer",
            "Bearer ",
            "Bearer    ",
            "Bearer a b",
            "Bearer abc!",
            "Bearer =abc",
            "Bearer abc=d",
            &format!("{bearer} "),
        ] {
            let response = fixture.get(&[value]).await;
            assert_refused(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        }
    }

    /// `1*SP` after the scheme, and the scheme in any case (RFC 6750 §2.1,
    /// RFC 7235 §2.1).
    #[sqlx::test]
    async fn several_spaces_after_bearer_are_accepted(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.token(&["openid"]);

        for value in [
            format!("Bearer   {token}"),
            format!("bearer {token}"),
            format!("BEARER {token}"),
        ] {
            let response = fixture.get(&[&value]).await;
            assert_eq!(response.status(), StatusCode::OK, "{value}");
        }
    }

    /// A token that does not verify: signed by a key CAS does not publish.
    /// Every other reason a token is refused for is covered where it is
    /// decided, in `oidc::tokens` and `oidc::keys`; they all get this
    /// answer.
    #[sqlx::test]
    async fn an_unverifiable_token_is_401(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let other_key = SigningKeys::from_pem(&fresh_signing_key_pem()).unwrap();
        let foreign =
            fixture.token_signed_by(other_key.active(), &["openid"], OffsetDateTime::now_utc());

        let response = fixture.get(&[&format!("Bearer {foreign}")]).await;

        assert_refused(response, StatusCode::UNAUTHORIZED, "invalid_token").await;
    }

    #[sqlx::test]
    async fn a_token_without_openid_is_403_insufficient_scope(pool: PgPool) {
        let fixture = fixture(&pool).await;

        let response = fixture
            .get(&[&format!("Bearer {}", fixture.token(&["profile", "email"]))])
            .await;

        assert_eq!(
            header_str(&response, header::WWW_AUTHENTICATE),
            Some(r#"Bearer error="insufficient_scope", scope="openid""#)
        );
        assert_refused(response, StatusCode::FORBIDDEN, "insufficient_scope").await;
    }

    #[sqlx::test]
    async fn a_token_of_a_deleted_account_is_401(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.token(&["openid"]);
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(fixture.account.id)
            .execute(&fixture.pool)
            .await
            .unwrap();

        let response = fixture.get(&[&format!("Bearer {token}")]).await;

        assert_refused(response, StatusCode::UNAUTHORIZED, "invalid_token").await;
    }

    /// The account is read on every call: a change made after the token
    /// was issued shows at once.
    #[sqlx::test]
    async fn the_claims_are_current(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let token = fixture.token(&["openid", "profile", "email"]);
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "UPDATE accounts SET display_name = 'Grace', email = 'grace@example.com' WHERE id = $1",
        )
        .bind(fixture.account.id)
        .execute(&fixture.pool)
        .await
        .unwrap();

        let response = fixture.get(&[&format!("Bearer {token}")]).await;

        let body = json(response).await;
        assert_eq!(body["name"], "Grace");
        assert_eq!(body["email"], "grace@example.com");
    }

    /// A database that does not answer while the account is read. The
    /// token is valid, so no challenge.
    #[tokio::test]
    async fn an_unavailable_database_is_temporarily_unavailable() {
        let pool = PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_secs(1))
            .connect_lazy("postgres://cas:cas@localhost:1/cas")
            .unwrap();
        let fixture = Fixture {
            router: userinfo_router(test_state(pool.clone())),
            pool,
            client: Client {
                id: ClientId::try_new(CLIENT).unwrap(),
                name: ClientName::try_new("Ligretto web").unwrap(),
                kind: ClientKind::Public,
                secret_hash: None,
                redirect_uris: vec![RedirectUri::try_new(CALLBACK).unwrap()],
                post_logout_redirect_uris: vec![],
                first_party: true,
                guest_login_allowed: false,
                scopes: scopes(&["openid"]),
                audience: Audience::try_new(CLIENT).unwrap(),
                created_at: OffsetDateTime::UNIX_EPOCH,
            },
            account: Account {
                id: uuid::Uuid::new_v4(),
                display_name: display_name("Ada"),
                r#type: crate::accounts::AccountType::Full,
                email: None,
                created_at: OffsetDateTime::UNIX_EPOCH,
                last_seen_at: OffsetDateTime::UNIX_EPOCH,
            },
        };

        let response = fixture
            .get(&[&format!("Bearer {}", fixture.token(&["openid"]))])
            .await;

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert!(!response.headers().contains_key(header::WWW_AUTHENTICATE));
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        assert_eq!(json(response).await["error"], "temporarily_unavailable");
    }

    /// Neither the token nor any of its segments reaches a log line, on
    /// success or refusal.
    #[sqlx::test]
    async fn no_token_is_logged(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let good = fixture.token(&["openid", "profile"]);
        let expired = fixture.token_signed_by(
            &test_signing_key(),
            &["openid"],
            OffsetDateTime::now_utc() - time::Duration::minutes(11),
        );
        let (events, _guard) = capture_tracing();

        for token in [&good, &expired] {
            fixture.get(&[&format!("Bearer {token}")]).await;
        }
        fixture.get(&[&format!("Bearer {good}"), "Bearer x"]).await;

        assert!(
            events.contains("userinfo token refused"),
            "{:?}",
            events.all()
        );
        for token in [&good, &expired] {
            for segment in token.split('.') {
                for event in events.all() {
                    assert!(!event.contains(segment), "a token was logged: {event}");
                }
            }
        }
    }
}
