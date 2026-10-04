//! `GET` and `POST /end_session`: RP-initiated logout (OpenID Connect
//! RP-Initiated Logout 1.0). Served under `/oidc` with `ApiState`, outside
//! `/api`: like `/authorize`, it is a top-level navigation from another
//! site, which the Fetch Metadata line under `/api` would refuse.
//!
//! The request is validated in full before anything happens, and every
//! refusal is CAS's own page: nothing is redirected until the
//! `post_logout_redirect_uri` is known to be the client's. Only then is the
//! session the cookie names ended — and only when it belongs to the account
//! the `id_token_hint` names — and the browser sent back with `state`. See
//! `docs/adr/0013-userinfo-and-rp-initiated-logout.md`.

use std::collections::BTreeMap;

use axum::{
    body::{Body, to_bytes},
    extract::{OriginalUri, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use tower_http::set_header::SetResponseHeaderLayer;
use url::Url;
use utoipa::openapi::{RefOr, ResponseBuilder, response::Response as OpenApiResponse};
use utoipa_axum::{router::OpenApiRouter, routes};

use super::page::{
    ErrorPage, HeadRefused, found, location_header, method_not_allowed, redirect_with,
};
use super::token::{MAX_BODY_BYTES, is_form};
use crate::http::ApiState;
use crate::http::response::{Documented, string_header};
use crate::oidc::authorization::{PageError, Params};
use crate::oidc::end_session::{EndSessionError, ValidEndSession};
use crate::sessions::SessionToken;
use crate::sessions::http::{CLEAR_SITE_DATA, CLEAR_SITE_DATA_ON_LOGOUT};

/// `GET /end_session` with the parameters in the query, `POST` with them in
/// a form body, as RP-Initiated Logout §2 requires both (ADR 0013 (h)); the
/// query of a `POST` is not read. `HEAD` is refused explicitly: axum would
/// serve it from the `GET` handler and end a session for a response nobody
/// reads.
///
/// Every answer is `no-store`: a route layer, so the root's fallback is not
/// wrapped (see `oidc::http::router`). There is no cookie renewal layer:
/// nothing here renews a session, and a response that ends one must not
/// re-send its cookie.
pub fn end_session_router(state: ApiState) -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(by_query, by_form, refuse_head))
        .route_layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .with_state(state)
}

/// What `/end_session` answers, for the description: a redirect once the
/// request is valid, CAS's own page for every refusal.
struct EndSessionResponses;

impl utoipa::IntoResponses for EndSessionResponses {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        let redirect = ResponseBuilder::new()
            .description(
                "To the registered `post_logout_redirect_uri` with `state`, or to the \
                 frontend's root without one.",
            )
            .header("Location", location_header())
            .header(
                "Set-Cookie",
                string_header(
                    "The removal of the session cookie, when the session it names was ended \
                     or is not live.",
                ),
            )
            .header(
                "Clear-Site-Data",
                string_header(r#"`"cache", "storage"`, when a session was ended."#),
            )
            .build();
        let mut responses = ErrorPage::responses();
        responses.insert(StatusCode::FOUND.as_str().to_owned(), RefOr::T(redirect));
        responses
    }
}

/// RP-initiated logout, the parameters in the query.
///
/// `id_token_hint` (required, an ID token CAS issued to the client,
/// expired or not), `client_id`, `post_logout_redirect_uri` and `state`
/// (RP-Initiated Logout 1.0 §2), read by hand, a repeated one refused. The
/// session the cookie names is ended only when it is the hint's account's
/// (ADR 0013).
#[utoipa::path(get, path = "/oidc/end_session", operation_id = "end_session_by_query")]
async fn by_query(
    State(state): State<ApiState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Documented<EndSessionResponses> {
    let params = Params::from_query(uri.query().unwrap_or_default());
    end_session(&state, &headers, &params).await.into()
}

/// RP-initiated logout, the parameters in a form body; the query is not
/// read.
///
/// The form is read as `/token` reads its own: the content type first,
/// then the body within the same bound.
#[utoipa::path(
    post,
    path = "/oidc/end_session",
    operation_id = "end_session_by_form",
    request_body(
        content = String,
        content_type = "application/x-www-form-urlencoded",
        description = "The parameters `GET` takes in its query.",
    )
)]
async fn by_form(
    State(state): State<ApiState>,
    headers: HeaderMap,
    body: Body,
) -> Documented<EndSessionResponses> {
    if !is_form(&headers) {
        return page(PageError::MalformedRequest(
            "the body must be application/x-www-form-urlencoded",
        ))
        .into();
    }
    let Ok(body) = to_bytes(body, MAX_BODY_BYTES).await else {
        return page(PageError::MalformedRequest(
            "the body is too large or unreadable",
        ))
        .into();
    };
    end_session(&state, &headers, &Params::from_form(&body))
        .await
        .into()
}

/// `HEAD /end_session` is refused: axum would serve it from the `GET`
/// handler and end a session for a response nobody reads.
#[utoipa::path(head, path = "/oidc/end_session", operation_id = "end_session_head")]
async fn refuse_head() -> Documented<HeadRefused> {
    method_not_allowed("GET, POST").into()
}

async fn end_session(state: &ApiState, headers: &HeaderMap, params: &Params) -> Response {
    let request = match state.end_session.validate(params).await {
        Ok(request) => request,
        Err(EndSessionError::Refused(error)) => return page(error),
        Err(EndSessionError::Db(error)) => return database_page(error),
    };

    // The trust boundary: the request is valid, and from here on it acts.
    let outcome = match end(state, headers, &request).await {
        Ok(outcome) => outcome,
        Err(error) => return database_page(error),
    };

    let mut response = back(&request, &state.frontend_origin);
    // The removal cookie is fixed attributes and an empty value, so it
    // always parses; the renewal layer sets its cookie the same way.
    if outcome.clears_cookie()
        && let Ok(removal) = state
            .cookies
            .removal()
            .encoded()
            .to_string()
            .parse::<HeaderValue>()
    {
        response.headers_mut().insert(header::SET_COOKIE, removal);
    }
    if outcome == Outcome::Ended {
        response
            .headers_mut()
            .insert(CLEAR_SITE_DATA, CLEAR_SITE_DATA_ON_LOGOUT);
    }
    response
}

/// What happened to the session the request's cookie names.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Outcome {
    /// The hint's account's session, ended.
    Ended,
    /// A cookie that names no live session, or that is not a session token
    /// at all: nothing to end, and nothing lost by forgetting it.
    Dead,
    /// Another account's live session, left exactly as it was.
    Kept,
    /// No session cookie.
    Absent,
}

impl Outcome {
    /// The removal cookie goes out when there is nothing live left behind
    /// the cookie, never over another account's live session.
    fn clears_cookie(self) -> bool {
        matches!(self, Self::Ended | Self::Dead)
    }
}

/// Ends the session the cookie names if it is the hint's account's (ADR
/// 0013 (f)). The session is looked up without renewing it, so a session of
/// another account is not touched even by its idle clock.
async fn end(
    state: &ApiState,
    headers: &HeaderMap,
    request: &ValidEndSession,
) -> Result<Outcome, sqlx::Error> {
    // The name is matched on the wire, undecoded, as the extractor does
    // (see `CookieSettings::presented`).
    let Some(presented) = state.cookies.presented(headers) else {
        return Ok(Outcome::Absent);
    };
    let Some(token) = SessionToken::parse(&presented) else {
        return Ok(Outcome::Dead);
    };
    let Some(session) = state.sessions.find(&token).await? else {
        tracing::debug!(
            client_id = %request.client_id,
            "logout request without a live session"
        );
        return Ok(Outcome::Dead);
    };
    if session.account_id != request.account_id {
        tracing::warn!(
            client_id = %request.client_id,
            session_id = %session.id,
            "logout hint names another account; the session is kept"
        );
        return Ok(Outcome::Kept);
    }

    // `None` is a logout that raced this one: the session is gone either
    // way.
    state.sessions.revoke(&token).await?;
    tracing::info!(
        client_id = %request.client_id,
        session_id = %session.id,
        "session ended by RP-initiated logout"
    );
    Ok(Outcome::Ended)
}

/// `302` to the registered `post_logout_redirect_uri` with `state` when one
/// was sent, or to the frontend's root when no address was: the frontend
/// shows sign-in to a browser without a session.
fn back(request: &ValidEndSession, frontend_origin: &Url) -> Response {
    match (&request.post_logout_redirect_uri, &request.state) {
        (Some(uri), Some(state)) => redirect_with(uri, &[("state", state)]),
        (Some(uri), None) => found(uri),
        (None, _) => {
            let mut root = frontend_origin.clone();
            root.set_path("/");
            root.set_query(None);
            root.set_fragment(None);
            found(root.as_str())
        }
    }
}

/// A refusal before anything is trusted, logged and rendered. Nothing from
/// the request goes into the log line but the fixed code.
fn page(error: PageError) -> Response {
    let page = ErrorPage::for_error(error);
    match error {
        PageError::UnknownClient | PageError::InvalidRedirectUri => {
            tracing::warn!(code = page.code, "logout request refused");
        }
        PageError::MalformedRequest(_) => {
            tracing::debug!(code = page.code, "logout request refused");
        }
    }
    page.into_response()
}

/// A database failure, before or after the trust boundary: a page either
/// way, and nothing is redirected.
fn database_page(error: sqlx::Error) -> Response {
    let page = ErrorPage::for_database(&error);
    tracing::error!(code = page.code, source = ?error, "logout request failed");
    page.into_response()
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::http::{Request, StatusCode};
    use sqlx::PgPool;
    use time::OffsetDateTime;
    use tower::ServiceExt;
    use url::form_urlencoded;

    use super::*;
    use crate::accounts::Account;
    use crate::clients::{Client, ClientId};
    use crate::oidc::authorization::tests::{CALLBACK, CHALLENGE};
    use crate::oidc::http::{authorize_router, token_router};
    use crate::oidc::{SigningKey, SigningKeys};
    use crate::sessions::SessionService;
    use crate::testing::{
        SignedIn, TEST_ORIGIN, capture_tracing, checked, fresh_signing_key_pem, header_str,
        register_public_client, signed_id_token, signed_in, test_cookies, test_signing_key,
        test_state,
    };

    const CLIENT: &str = "ligretto-web";
    const SIGNED_OUT: &str = "https://app.example/signed-out";
    const SIGNED_OUT_WITH_QUERY: &str = "https://app.example/bye?from=cas";
    /// RFC 7636 Appendix B: the verifier of [`CHALLENGE`].
    const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    async fn register(pool: &PgPool, id: &str) -> Client {
        register_public_client(pool, id, &[SIGNED_OUT, SIGNED_OUT_WITH_QUERY]).await
    }

    struct Fixture {
        router: Router,
        pool: PgPool,
        client: Client,
        ada: SignedIn,
    }

    async fn fixture(pool: &PgPool) -> Fixture {
        Fixture {
            router: checked(end_session_router(test_state(pool.clone()))),
            pool: pool.clone(),
            client: register(pool, CLIENT).await,
            ada: signed_in(pool, "Ada").await,
        }
    }

    impl Fixture {
        /// An ID token for `account`, as `/token` issues it, signed by
        /// `key` at `issued_at`.
        fn hint_signed_by(
            &self,
            key: &SigningKey,
            account: &Account,
            issued_at: OffsetDateTime,
        ) -> String {
            signed_id_token(
                key,
                &self.client,
                account,
                &["openid", "profile", "email"],
                issued_at,
            )
        }

        /// A fresh hint for Ada.
        fn hint(&self) -> String {
            self.hint_signed_by(
                &test_signing_key(),
                &self.ada.account,
                OffsetDateTime::now_utc(),
            )
        }

        async fn get(&self, pairs: &[(&str, &str)], cookie: Option<&str>) -> Response {
            send(&self.router, "GET", &uri(pairs), cookie, None).await
        }

        async fn session_is_live(&self, token: &SessionToken) -> bool {
            SessionService::new(self.pool.clone())
                .find(token)
                .await
                .unwrap()
                .is_some()
        }
    }

    fn form(pairs: &[(&str, &str)]) -> String {
        form_urlencoded::Serializer::new(String::new())
            .extend_pairs(pairs)
            .finish()
    }

    fn uri(pairs: &[(&str, &str)]) -> String {
        format!("/oidc/end_session?{}", form(pairs))
    }

    async fn send(
        router: &Router,
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        body: Option<(&str, String)>,
    ) -> Response {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        let body = match body {
            Some((content_type, body)) => {
                request = request.header(header::CONTENT_TYPE, content_type);
                Body::from(body)
            }
            None => Body::empty(),
        };
        router
            .clone()
            .oneshot(request.body(body).unwrap())
            .await
            .unwrap()
    }

    /// Whether the response removes the session cookie.
    fn clears_cookie(response: &Response) -> bool {
        header_str(response, header::SET_COOKIE).is_some_and(|cookie| {
            cookie.starts_with(&format!("{}=;", test_cookies().name()))
                && cookie.contains("Max-Age=0")
        })
    }

    async fn assert_page(response: Response, status: StatusCode, code: &str) {
        assert_eq!(response.status(), status, "{code}");
        assert!(!response.headers().contains_key(header::LOCATION), "{code}");
        assert!(
            !response.headers().contains_key(header::SET_COOKIE),
            "{code}"
        );
        assert!(!response.headers().contains_key(CLEAR_SITE_DATA), "{code}");
        assert_eq!(
            header_str(&response, header::CONTENT_TYPE),
            Some("text/html; charset=utf-8")
        );
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(body.starts_with("<!doctype html>"), "{body}");
        assert!(body.contains(&format!("<code>{code}</code>")), "{body}");
    }

    fn assert_redirect(response: &Response, location: &str) {
        assert_eq!(response.status(), StatusCode::FOUND, "{location}");
        assert_eq!(header_str(response, header::LOCATION), Some(location));
        assert_eq!(
            header_str(response, header::CACHE_CONTROL),
            Some("no-store")
        );
    }

    /// The second acceptance criterion, first half: a registered address
    /// ends the session and goes back with `state`.
    #[sqlx::test]
    async fn a_valid_logout_ends_the_session_and_redirects_with_state(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();
        let state = test_state(pool.clone());

        let response = fixture
            .get(
                &[
                    ("id_token_hint", &hint),
                    ("post_logout_redirect_uri", SIGNED_OUT),
                    ("state", "xyz/1"),
                ],
                Some(&fixture.ada.cookie),
            )
            .await;

        assert_redirect(&response, &format!("{SIGNED_OUT}?state=xyz%2F1"));
        assert!(clears_cookie(&response), "{response:?}");
        assert_eq!(
            header_str(&response, CLEAR_SITE_DATA),
            Some(r#""cache", "storage""#)
        );
        assert!(!fixture.session_is_live(&fixture.ada.token).await);
        // Unchecked query: see docs/TESTS.md.
        let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions WHERE id = $1")
            .bind(fixture.ada.session_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows, 0, "the row is gone");
        let me = checked(crate::sessions::http::router(state))
            .oneshot(
                Request::builder()
                    .uri("/me")
                    .header(header::COOKIE, &fixture.ada.cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(me.status(), StatusCode::UNAUTHORIZED);

        // A registered address with a query of its own gets `&`.
        let again = signed_in(&pool, "Ada again").await;
        let hint = fixture.hint_signed_by(
            &test_signing_key(),
            &again.account,
            OffsetDateTime::now_utc(),
        );
        let response = fixture
            .get(
                &[
                    ("id_token_hint", &hint),
                    ("post_logout_redirect_uri", SIGNED_OUT_WITH_QUERY),
                    ("state", "xyz"),
                ],
                Some(&again.cookie),
            )
            .await;
        assert_redirect(&response, &format!("{SIGNED_OUT_WITH_QUERY}&state=xyz"));
    }

    /// The second acceptance criterion, second half: an address the client
    /// did not register is never redirected to, and the session stays.
    #[sqlx::test]
    async fn an_unregistered_post_logout_redirect_uri_renders_a_page_and_keeps_the_session(
        pool: PgPool,
    ) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();

        for address in [
            "https://evil.example/",
            "https://app.example/signed-out/",
            "https://app.example/SIGNED-OUT",
            CALLBACK,
        ] {
            let response = fixture
                .get(
                    &[
                        ("id_token_hint", &hint),
                        ("post_logout_redirect_uri", address),
                        ("state", "xyz"),
                    ],
                    Some(&fixture.ada.cookie),
                )
                .await;

            assert_page(response, StatusCode::BAD_REQUEST, "invalid_redirect_uri").await;
            assert!(
                fixture.session_is_live(&fixture.ada.token).await,
                "{address}"
            );
        }
    }

    /// Without an address the browser lands on CAS's own frontend, and
    /// `state` has nowhere to go.
    #[sqlx::test]
    async fn without_a_redirect_uri_it_goes_to_the_frontend_root(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();

        let response = fixture
            .get(
                &[("id_token_hint", &hint), ("state", "xyz")],
                Some(&fixture.ada.cookie),
            )
            .await;

        assert_redirect(&response, &format!("{TEST_ORIGIN}/"));
        assert!(clears_cookie(&response));
        assert!(!fixture.session_is_live(&fixture.ada.token).await);
    }

    /// An ID token long past its `exp` is still a hint.
    #[sqlx::test]
    async fn an_expired_hint_is_accepted(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint_signed_by(
            &test_signing_key(),
            &fixture.ada.account,
            OffsetDateTime::now_utc() - time::Duration::days(3),
        );

        let response = fixture
            .get(
                &[
                    ("id_token_hint", &hint),
                    ("post_logout_redirect_uri", SIGNED_OUT),
                ],
                Some(&fixture.ada.cookie),
            )
            .await;

        assert_redirect(&response, SIGNED_OUT);
        assert!(!fixture.session_is_live(&fixture.ada.token).await);
    }

    /// A request without a hint, and one whose hint does not verify: a
    /// key that is not published, a forger's or one retired since. The
    /// session stays. Every other reason a hint is refused for is covered
    /// where it is decided, in `oidc::tokens` and `oidc::keys`.
    #[sqlx::test]
    async fn a_missing_or_unverifiable_hint_is_a_page(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let unpublished = SigningKeys::from_pem(&fresh_signing_key_pem()).unwrap();
        let unverifiable = fixture.hint_signed_by(
            unpublished.active(),
            &fixture.ada.account,
            OffsetDateTime::now_utc(),
        );

        for pairs in [
            &[][..],
            &[("post_logout_redirect_uri", SIGNED_OUT)],
            &[
                ("id_token_hint", unverifiable.as_str()),
                ("post_logout_redirect_uri", SIGNED_OUT),
            ],
        ] {
            let response = fixture.get(pairs, Some(&fixture.ada.cookie)).await;
            assert_page(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        }
        assert!(fixture.session_is_live(&fixture.ada.token).await);
    }

    #[sqlx::test]
    async fn a_client_id_that_does_not_match_the_hint_is_a_page(pool: PgPool) {
        let fixture = fixture(&pool).await;
        register(&pool, "another-app").await;
        let hint = fixture.hint();

        for client_id in ["another-app", "Not A Client"] {
            let response = fixture
                .get(
                    &[("id_token_hint", &hint), ("client_id", client_id)],
                    Some(&fixture.ada.cookie),
                )
                .await;
            assert_page(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        }

        let matching = fixture
            .get(
                &[("id_token_hint", &hint), ("client_id", CLIENT)],
                Some(&fixture.ada.cookie),
            )
            .await;
        assert_redirect(&matching, &format!("{TEST_ORIGIN}/"));
    }

    /// A hint whose `aud` no client has: a client deleted since, or a
    /// token CAS never issued to anyone registered.
    #[sqlx::test]
    async fn an_unknown_client_is_a_page(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let mut ghost = fixture.client.clone();
        ghost.id = ClientId::try_new("ghost").unwrap();
        let hint = signed_id_token(
            &test_signing_key(),
            &ghost,
            &fixture.ada.account,
            &["openid"],
            OffsetDateTime::now_utc(),
        );

        let response = fixture
            .get(&[("id_token_hint", &hint)], Some(&fixture.ada.cookie))
            .await;

        assert_page(response, StatusCode::BAD_REQUEST, "unknown_client").await;
        assert!(fixture.session_is_live(&fixture.ada.token).await);
    }

    /// A page that holds its own account's hint cannot sign out whoever
    /// else is signed in to CAS in this browser.
    #[sqlx::test]
    async fn a_hint_for_another_account_leaves_the_session_alone(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let eve = signed_in(&pool, "Eve").await;
        let hint =
            fixture.hint_signed_by(&test_signing_key(), &eve.account, OffsetDateTime::now_utc());
        let (events, _guard) = capture_tracing();

        let response = fixture
            .get(
                &[
                    ("id_token_hint", &hint),
                    ("post_logout_redirect_uri", SIGNED_OUT),
                    ("state", "s"),
                ],
                Some(&fixture.ada.cookie),
            )
            .await;

        assert_redirect(&response, &format!("{SIGNED_OUT}?state=s"));
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        assert!(!response.headers().contains_key(CLEAR_SITE_DATA));
        assert!(fixture.session_is_live(&fixture.ada.token).await);
        assert!(fixture.session_is_live(&eve.token).await);
        let [warning] = &events.mentioning("names another account")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(warning.starts_with("WARN"), "{warning}");
        assert!(warning.contains(CLIENT), "{warning}");
        assert!(
            warning.contains(&fixture.ada.session_id.to_string()),
            "{warning}"
        );
    }

    /// Looking at another account's session to decide not to end it does
    /// not renew it either: its idle clock, its account's `last_seen_at`
    /// and its cookie are as they were.
    #[sqlx::test]
    async fn a_hint_for_another_account_does_not_renew_its_session(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let eve = signed_in(&pool, "Eve").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE id = $1")
            .bind(fixture.ada.session_id)
            .execute(&pool)
            .await
            .unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE accounts SET last_seen_at = now() - interval '2 hours' WHERE id = $1")
            .bind(fixture.ada.account.id)
            .execute(&pool)
            .await
            .unwrap();
        // Unchecked query: see docs/TESTS.md.
        let clocks = || async {
            sqlx::query_as::<_, (OffsetDateTime, OffsetDateTime)>(
                "SELECT s.last_seen_at, a.last_seen_at FROM sessions s \
                 JOIN accounts a ON a.id = s.account_id WHERE s.id = $1",
            )
            .bind(fixture.ada.session_id)
            .fetch_one(&pool)
            .await
            .unwrap()
        };
        let before = clocks().await;
        let hint =
            fixture.hint_signed_by(&test_signing_key(), &eve.account, OffsetDateTime::now_utc());

        let response = fixture
            .get(&[("id_token_hint", &hint)], Some(&fixture.ada.cookie))
            .await;

        assert_eq!(response.status(), StatusCode::FOUND);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        assert_eq!(clocks().await, before);
    }

    /// Logout is idempotent: with no session, or a dead one, the request
    /// still redirects, and a dead cookie is cleared.
    #[sqlx::test]
    async fn without_a_session_it_still_redirects(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();
        let pairs = [
            ("id_token_hint", hint.as_str()),
            ("post_logout_redirect_uri", SIGNED_OUT),
            ("state", "s"),
        ];

        let anonymous = fixture.get(&pairs, None).await;
        assert_redirect(&anonymous, &format!("{SIGNED_OUT}?state=s"));
        assert!(!anonymous.headers().contains_key(header::SET_COOKIE));
        assert!(!anonymous.headers().contains_key(CLEAR_SITE_DATA));

        let ended = fixture.get(&pairs, Some(&fixture.ada.cookie)).await;
        assert!(clears_cookie(&ended));
        let again = fixture.get(&pairs, Some(&fixture.ada.cookie)).await;
        assert_redirect(&again, &format!("{SIGNED_OUT}?state=s"));
        assert!(clears_cookie(&again), "a dead cookie is forgotten");
        assert!(!again.headers().contains_key(CLEAR_SITE_DATA));

        let junk = format!("{}=not-a-token", test_cookies().name());
        let response = fixture.get(&pairs, Some(&junk)).await;
        assert_redirect(&response, &format!("{SIGNED_OUT}?state=s"));
        assert!(clears_cookie(&response));
    }

    #[sqlx::test]
    async fn a_repeated_parameter_is_a_page(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();

        for (name, value) in [
            ("id_token_hint", hint.as_str()),
            ("client_id", CLIENT),
            ("post_logout_redirect_uri", SIGNED_OUT),
            ("state", "s"),
        ] {
            let response = fixture
                .get(
                    &[
                        ("id_token_hint", &hint),
                        ("client_id", CLIENT),
                        ("post_logout_redirect_uri", SIGNED_OUT),
                        ("state", "s"),
                        (name, value),
                    ],
                    Some(&fixture.ada.cookie),
                )
                .await;
            assert_page(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        }
        assert!(fixture.session_is_live(&fixture.ada.token).await);
    }

    /// RP-Initiated Logout §2 requires `POST` too; its query is not read.
    #[sqlx::test]
    async fn post_with_a_form_ends_the_session_like_get(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();

        let response = send(
            &fixture.router,
            "POST",
            "/oidc/end_session?post_logout_redirect_uri=https%3A%2F%2Fevil.example%2F",
            Some(&fixture.ada.cookie),
            Some((
                "application/x-www-form-urlencoded; charset=UTF-8",
                form(&[
                    ("id_token_hint", &hint),
                    ("post_logout_redirect_uri", SIGNED_OUT),
                    ("state", "s"),
                ]),
            )),
        )
        .await;

        assert_redirect(&response, &format!("{SIGNED_OUT}?state=s"));
        assert!(clears_cookie(&response));
        assert!(!fixture.session_is_live(&fixture.ada.token).await);
    }

    #[sqlx::test]
    async fn post_with_another_content_type_is_a_page(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();
        let body = form(&[("id_token_hint", &hint)]);

        for content_type in ["application/json", "text/plain"] {
            let response = send(
                &fixture.router,
                "POST",
                "/oidc/end_session",
                Some(&fixture.ada.cookie),
                Some((content_type, body.clone())),
            )
            .await;
            assert_page(response, StatusCode::BAD_REQUEST, "invalid_request").await;
        }
        let oversized = send(
            &fixture.router,
            "POST",
            "/oidc/end_session",
            Some(&fixture.ada.cookie),
            Some((
                "application/x-www-form-urlencoded",
                format!("{body}&pad={}", "a".repeat(9 * 1024)),
            )),
        )
        .await;
        assert_page(oversized, StatusCode::BAD_REQUEST, "invalid_request").await;
        assert!(fixture.session_is_live(&fixture.ada.token).await);
    }

    #[sqlx::test]
    async fn head_is_405(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();

        let response = send(
            &fixture.router,
            "HEAD",
            &uri(&[("id_token_hint", &hint)]),
            Some(&fixture.ada.cookie),
            None,
        )
        .await;

        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(header_str(&response, header::ALLOW), Some("GET, POST"));
        assert!(fixture.session_is_live(&fixture.ada.token).await);
    }

    /// Every answer is `no-store`: a redirect, a page, a `405`.
    #[sqlx::test]
    async fn answers_are_no_store(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let hint = fixture.hint();

        for (method, uri) in [
            ("GET", uri(&[("id_token_hint", &hint)])),
            ("GET", "/oidc/end_session".to_owned()),
            ("HEAD", "/oidc/end_session".to_owned()),
        ] {
            let response = send(&fixture.router, method, &uri, None, None).await;
            assert_eq!(
                header_str(&response, header::CACHE_CONTROL),
                Some("no-store"),
                "{method} {uri}"
            );
        }
    }

    /// Logout ends the CAS session and nothing else: the application's
    /// grant, obtained with that session, still refreshes (ADR 0013 (i)).
    /// The hint is the ID token `/token` itself issued.
    #[sqlx::test]
    async fn grants_survive_the_logout(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let state = test_state(pool.clone());
        let router = Router::new()
            .merge(checked(
                OpenApiRouter::new()
                    .merge(authorize_router(state.clone()))
                    .merge(token_router(state)),
            ))
            .merge(fixture.router.clone());

        let authorize = send(
            &router,
            "GET",
            &format!(
                "/oidc/authorize?{}",
                form(&[
                    ("client_id", CLIENT),
                    ("redirect_uri", CALLBACK),
                    ("response_type", "code"),
                    ("scope", "openid profile"),
                    ("state", "s"),
                    ("code_challenge", CHALLENGE),
                    ("code_challenge_method", "S256"),
                ])
            ),
            Some(&fixture.ada.cookie),
            None,
        )
        .await;
        let location = Url::parse(header_str(&authorize, header::LOCATION).unwrap()).unwrap();
        let code = location
            .query_pairs()
            .find(|(name, _)| name == "code")
            .map(|(_, value)| value.into_owned())
            .expect("a code");
        let token = |pairs: Vec<(&str, &str)>| {
            send(
                &router,
                "POST",
                "/oidc/token",
                None,
                Some(("application/x-www-form-urlencoded", form(&pairs))),
            )
        };
        let exchanged = token(vec![
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT),
            ("code", &code),
            ("redirect_uri", CALLBACK),
            ("code_verifier", VERIFIER),
        ])
        .await;
        assert_eq!(exchanged.status(), StatusCode::OK);
        let bytes = to_bytes(exchanged.into_body(), usize::MAX).await.unwrap();
        let tokens: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

        let logout = send(
            &router,
            "GET",
            &uri(&[
                ("id_token_hint", tokens["id_token"].as_str().unwrap()),
                ("post_logout_redirect_uri", SIGNED_OUT),
            ]),
            Some(&fixture.ada.cookie),
            None,
        )
        .await;
        assert_redirect(&logout, SIGNED_OUT);
        assert!(!fixture.session_is_live(&fixture.ada.token).await);

        let refreshed = token(vec![
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT),
            ("refresh_token", tokens["refresh_token"].as_str().unwrap()),
        ])
        .await;
        assert_eq!(refreshed.status(), StatusCode::OK);
    }
}
