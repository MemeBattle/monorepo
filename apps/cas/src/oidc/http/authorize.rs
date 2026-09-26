//! `GET /authorize`: the start of the authorization code flow with PKCE
//! (ADR 0010). Served at the root with `ApiState`, outside `/api`: it is a
//! top-level navigation from another site, which is exactly what the Fetch
//! Metadata line under `/api` refuses.
//!
//! Two channels answer a failure, and which one is decided by whether the
//! redirect URI is trusted yet. Before it is — an unknown client, a
//! redirect URI the client did not register, a request with no parameters —
//! CAS renders a page of its own and never redirects. After it is, every
//! failure goes back to the client as `error`, `error_description` and
//! `state` in the redirect (RFC 6749 §4.1.2.1).

use axum::{
    Router,
    extract::{OriginalUri, State},
    http::{Extensions, HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use tower_http::set_header::SetResponseHeaderLayer;
use url::{Url, form_urlencoded};

use crate::db::Failure;
use crate::http::ApiState;
use crate::oidc::authorization::{self, AuthorizeRequest, OAuthError, PageError, Params};
use crate::oidc::service::IssueError;
use crate::sessions::http::extract::resolve_session;
use crate::sessions::http::with_cookie_renewal;

/// How much of an unknown `client_id` goes into a log line. The value is
/// the caller's choice, so it is bounded.
const LOGGED_CLIENT_ID_CHARS: usize = 64;

/// `GET /authorize`, holding `ApiState`. `HEAD` is refused explicitly: axum
/// serves it from the `GET` handler otherwise, and a `HEAD` must not
/// authenticate and mint a code whose response body nobody reads.
///
/// Every answer is `no-store`, because the `Location` of a success carries
/// a code; a route layer, so the root's fallback is not wrapped (see
/// `oidc::http::router`). The cookie renewal layer re-sends the session
/// cookie when resolving the session renewed it, as under `/api`.
pub fn authorize_router(state: ApiState) -> Router {
    with_cookie_renewal(
        Router::new()
            .route("/authorize", get(authorize).head(method_not_allowed))
            .route_layer(SetResponseHeaderLayer::overriding(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-store"),
            ))
            .with_state(state),
    )
}

async fn method_not_allowed() -> impl IntoResponse {
    (StatusCode::METHOD_NOT_ALLOWED, [(header::ALLOW, "GET")])
}

async fn authorize(
    State(state): State<ApiState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    extensions: Extensions,
) -> Response {
    let Some(query) = uri.query().filter(|query| !query.is_empty()) else {
        return page(
            PageError::MalformedRequest("the request carries no parameters"),
            None,
        );
    };
    let params = Params::from_query(query);

    // Until the client and the redirect URI are known, nothing may be sent
    // to the redirect URI.
    let client_id = match authorization::client_id(&params) {
        Ok(client_id) => client_id,
        Err(error) => return page(error, params.first_raw("client_id")),
    };
    let client = match state.authorization.client(&client_id).await {
        Ok(Some(client)) => client,
        Ok(None) => return page(PageError::UnknownClient, Some(client_id.as_ref())),
        Err(error) => return database_page(error),
    };
    let redirect_uri = match authorization::redirect_uri(&params, &client) {
        Ok(redirect_uri) => redirect_uri,
        Err(error) => return page(error, Some(client_id.as_ref())),
    };

    // The trust boundary: from here on every answer is a redirect.
    let back = Back {
        redirect_uri,
        state: authorization::echoed_state(&params),
        client_id: client_id.as_ref(),
    };
    let request = match AuthorizeRequest::parse(&params, &client, redirect_uri) {
        Ok(request) => request,
        Err(error) => return back.error(error.error, &error.description),
    };

    let authenticated = match resolve_session(&state, &headers, &extensions, uri.path()).await {
        Ok(Some(authenticated)) => authenticated,
        Ok(None) if request.prompt_none => {
            return back.error(OAuthError::LoginRequired, "the account is not signed in");
        }
        Ok(None) => return sign_in(&state.frontend_origin, &uri),
        Err(error) => return back.operational(&error),
    };

    match state
        .authorization
        .issue(&request, &client, &authenticated)
        .await
    {
        Ok(issued) => back.redirect(&[("code", issued.code.expose()), ("state", &request.state)]),
        Err(IssueError::ConsentRequired) => back.error(
            OAuthError::UnauthorizedClient,
            "consent is not available yet; only first-party clients can be authorized",
        ),
        Err(IssueError::Db(error)) => back.operational(&error),
        Err(IssueError::Random(error)) => {
            tracing::error!(error = %error, "no randomness for an authorization code");
            back.error(OAuthError::ServerError, "the server could not issue a code")
        }
    }
}

/// How a database failure after the trust boundary is reported to the
/// client: RFC 6749 §4.1.2.1 has a code for a retryable failure and one for
/// everything else, which [`crate::db::classify`] tells apart.
fn operational_error(error: &sqlx::Error) -> OAuthError {
    match crate::db::classify(error) {
        Some(Failure::Unavailable | Failure::Busy) => OAuthError::TemporarilyUnavailable,
        None => OAuthError::ServerError,
    }
}

/// The way back to a trusted redirect URI.
struct Back<'a> {
    redirect_uri: &'a str,
    /// Echoed on errors when the request carried exactly one non-empty one.
    state: Option<&'a str>,
    client_id: &'a str,
}

impl Back<'_> {
    fn error(&self, error: OAuthError, description: &str) -> Response {
        tracing::debug!(
            client_id = self.client_id,
            error = error.as_str(),
            "authorization request refused"
        );
        let mut pairs = vec![
            ("error", error.as_str()),
            ("error_description", description),
        ];
        if let Some(state) = self.state {
            pairs.push(("state", state));
        }
        self.redirect(&pairs)
    }

    fn operational(&self, error: &sqlx::Error) -> Response {
        let code = operational_error(error);
        tracing::error!(
            client_id = self.client_id,
            error = code.as_str(),
            source = ?error,
            "authorization request failed"
        );
        let description = match code {
            OAuthError::TemporarilyUnavailable => "the service is unavailable, try again later",
            _ => "the server could not complete the request",
        };
        self.error(code, description)
    }

    /// `302` to the redirect URI with `pairs` appended to its query: with
    /// `&` when the registered URI already has one, `?` otherwise (RFC 6749
    /// §4.1.2).
    fn redirect(&self, pairs: &[(&str, &str)]) -> Response {
        let query = form_urlencoded::Serializer::new(String::new())
            .extend_pairs(pairs)
            .finish();
        let separator = if self.redirect_uri.contains('?') {
            '&'
        } else {
            '?'
        };
        found(&format!("{}{separator}{query}", self.redirect_uri))
    }
}

/// `302` to the frontend's sign-in screen with `return_to` set to this very
/// request, path and query, relative: after the ceremony the frontend
/// navigates there and the same request completes with a session (ADR 0010
/// (c)). Nothing is stored.
fn sign_in(frontend_origin: &Url, uri: &axum::http::Uri) -> Response {
    let return_to = uri
        .path_and_query()
        .map_or("/authorize", |path_and_query| path_and_query.as_str());
    let mut location = frontend_origin.clone();
    location.set_path("/sign-in");
    location.set_fragment(None);
    location
        .query_pairs_mut()
        .clear()
        .append_pair("return_to", return_to);
    found(location.as_str())
}

fn found(location: &str) -> Response {
    match HeaderValue::from_str(location) {
        Ok(location) => (StatusCode::FOUND, [(header::LOCATION, location)]).into_response(),
        // A registered redirect URI is validated ASCII and every appended
        // value is percent-encoded, so this is a bug, not a request to
        // name.
        Err(error) => {
            tracing::error!(error = %error, "a redirect location is not a header value");
            ErrorPage::INTERNAL.into_response()
        }
    }
}

/// A pre-redirect failure, logged and rendered. `client_id` is the value as
/// sent, if any.
fn page(error: PageError, client_id: Option<&str>) -> Response {
    let page = match error {
        PageError::UnknownClient => ErrorPage::UNKNOWN_CLIENT,
        PageError::InvalidRedirectUri => ErrorPage::INVALID_REDIRECT_URI,
        PageError::MalformedRequest(description) => ErrorPage {
            description,
            ..ErrorPage::INVALID_REQUEST
        },
    };
    let client_id = client_id.map(|value| {
        value
            .chars()
            .take(LOGGED_CLIENT_ID_CHARS)
            .collect::<String>()
    });
    match error {
        PageError::UnknownClient | PageError::InvalidRedirectUri => {
            tracing::warn!(code = page.code, client_id = ?client_id, "authorization request refused");
        }
        PageError::MalformedRequest(_) => {
            tracing::debug!(code = page.code, "authorization request refused");
        }
    }
    page.into_response()
}

/// A database failure while the client is looked up: before the redirect
/// URI is trusted, so a page, like every other failure there.
fn database_page(error: sqlx::Error) -> Response {
    let page = match crate::db::classify(&error) {
        Some(Failure::Unavailable | Failure::Busy) => ErrorPage::SERVICE_UNAVAILABLE,
        None => ErrorPage::INTERNAL,
    };
    tracing::error!(code = page.code, source = ?error, "authorization request failed");
    page.into_response()
}

/// CAS's own answer to a request it cannot send back to the client: a
/// minimal document of fixed strings. Nothing from the request is rendered,
/// so no escaping question arises.
#[derive(Debug, Clone, Copy)]
struct ErrorPage {
    status: StatusCode,
    code: &'static str,
    title: &'static str,
    description: &'static str,
}

impl ErrorPage {
    const UNKNOWN_CLIENT: Self = Self {
        status: StatusCode::BAD_REQUEST,
        code: "unknown_client",
        title: "Unknown application",
        description: "The application that sent you here is not registered with this service.",
    };

    const INVALID_REDIRECT_URI: Self = Self {
        status: StatusCode::BAD_REQUEST,
        code: "invalid_redirect_uri",
        title: "Invalid return address",
        description: "The application that sent you here asked to return to an address it has not registered.",
    };

    const INVALID_REQUEST: Self = Self {
        status: StatusCode::BAD_REQUEST,
        code: "invalid_request",
        title: "Invalid request",
        description: "The request is malformed.",
    };

    const SERVICE_UNAVAILABLE: Self = Self {
        status: StatusCode::SERVICE_UNAVAILABLE,
        code: "service_unavailable",
        title: "Service unavailable",
        description: "The service is temporarily unavailable. Try again later.",
    };

    const INTERNAL: Self = Self {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        code: "internal",
        title: "Something went wrong",
        description: "The service could not handle the request.",
    };
}

impl IntoResponse for ErrorPage {
    fn into_response(self) -> Response {
        let Self {
            status,
            code,
            title,
            description,
        } = self;
        let body = format!(
            "<!doctype html>\n\
             <html lang=\"en\">\n\
             <head>\n\
             <meta charset=\"utf-8\">\n\
             <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
             <title>{title}</title>\n\
             </head>\n\
             <body>\n\
             <h1>{title}</h1>\n\
             <p>{description}</p>\n\
             <p>Error code: <code>{code}</code></p>\n\
             </body>\n\
             </html>\n"
        );
        (
            status,
            [(
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            )],
            body,
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use axum::body::{Body, to_bytes};
    use axum::http::Request;
    use sqlx::PgPool;
    use sqlx::postgres::PgPoolOptions;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::clients::{
        ClientId, ClientName, ClientRepository, ClientSecret, NewClient, RedirectUri, Scope,
    };
    use crate::db::test_support::db_error;
    use crate::oidc::AuthorizationCode;
    use crate::oidc::authorization::tests::{CALLBACK, CHALLENGE};
    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{
        TEST_ORIGIN, capture_tracing, display_name, test_config, test_cookies, test_state,
    };

    #[test]
    fn a_retryable_database_failure_is_temporarily_unavailable() {
        for error in [
            db_error("08006"),
            db_error("40001"),
            sqlx::Error::PoolTimedOut,
        ] {
            assert_eq!(
                operational_error(&error),
                OAuthError::TemporarilyUnavailable,
                "{error:?}"
            );
        }
    }

    #[test]
    fn any_other_database_failure_is_a_server_error() {
        for error in [db_error("23505"), sqlx::Error::RowNotFound] {
            assert_eq!(
                operational_error(&error),
                OAuthError::ServerError,
                "{error:?}"
            );
        }
    }

    fn scopes(values: &[&str]) -> Vec<Scope> {
        values
            .iter()
            .map(|value| Scope::try_new(*value).unwrap())
            .collect()
    }

    /// The `ligretto` client as `scripts/seed-dev.sh` registers it.
    async fn register_ligretto(pool: &PgPool) {
        ClientRepository::new(pool.clone())
            .create(
                NewClient::confidential(
                    ClientId::try_new("ligretto").unwrap(),
                    ClientName::try_new("Ligretto").unwrap(),
                    ClientSecret::generate().unwrap().hash(),
                    vec![RedirectUri::try_new(CALLBACK).unwrap()],
                )
                .unwrap()
                .first_party(true)
                .with_scopes(scopes(&["openid", "profile", "email"])),
            )
            .await
            .unwrap();
    }

    async fn register_public(pool: &PgPool, id: &str, redirect_uri: &str, first_party: bool) {
        ClientRepository::new(pool.clone())
            .create(
                NewClient::public(
                    ClientId::try_new(id).unwrap(),
                    ClientName::try_new("App").unwrap(),
                    vec![RedirectUri::try_new(redirect_uri).unwrap()],
                )
                .unwrap()
                .first_party(first_party)
                .with_scopes(scopes(&["openid", "profile"])),
            )
            .await
            .unwrap();
    }

    struct SignedIn {
        cookie: String,
        account_id: Uuid,
        session_id: Uuid,
    }

    async fn signed_in(pool: &PgPool) -> SignedIn {
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let issued = SessionService::new(pool.clone())
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        SignedIn {
            cookie: format!("{}={}", test_cookies().name(), issued.token.expose()),
            account_id: account.id,
            session_id: issued.session.id,
        }
    }

    fn valid() -> Vec<(&'static str, String)> {
        vec![
            ("client_id", "ligretto".to_owned()),
            ("redirect_uri", CALLBACK.to_owned()),
            ("response_type", "code".to_owned()),
            ("scope", "openid profile".to_owned()),
            ("state", "st/ate+1".to_owned()),
            ("code_challenge", CHALLENGE.to_owned()),
            ("code_challenge_method", "S256".to_owned()),
        ]
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

    fn uri(pairs: &[(&str, String)]) -> String {
        let query = form_urlencoded::Serializer::new(String::new())
            .extend_pairs(pairs.iter().map(|(name, value)| (*name, value.as_str())))
            .finish();
        format!("/authorize?{query}")
    }

    async fn send(router: &Router, method: &str, uri: &str, cookie: Option<&str>) -> Response {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        router
            .clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    fn header_str(response: &Response, name: header::HeaderName) -> Option<&str> {
        response
            .headers()
            .get(name)
            .map(|value| value.to_str().unwrap())
    }

    fn location(response: &Response) -> Url {
        Url::parse(header_str(response, header::LOCATION).expect("a Location")).unwrap()
    }

    /// The query parameters of the `Location`, decoded, in order.
    fn location_params(response: &Response) -> Vec<(String, String)> {
        location(response)
            .query_pairs()
            .map(|(name, value)| (name.into_owned(), value.into_owned()))
            .collect()
    }

    fn param(params: &[(String, String)], name: &str) -> Option<String> {
        params
            .iter()
            .find(|(candidate, _)| candidate == name)
            .map(|(_, value)| value.clone())
    }

    async fn body(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    /// The URL without its query, for comparing where a redirect goes.
    fn target(url: &Url) -> String {
        let mut url = url.clone();
        url.set_query(None);
        url.to_string()
    }

    fn assert_no_store(response: &Response) {
        assert_eq!(
            header_str(response, header::CACHE_CONTROL),
            Some("no-store")
        );
    }

    /// The second acceptance criterion, backend half: an anonymous request
    /// goes to the sign-in screen, carrying itself as `return_to`.
    #[sqlx::test]
    async fn an_anonymous_request_is_sent_to_sign_in_with_return_to(pool: PgPool) {
        register_ligretto(&pool).await;
        let router = authorize_router(test_state(pool));
        let original = uri(&valid());

        let response = send(&router, "GET", &original, None).await;

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_no_store(&response);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        let location = location(&response);
        assert_eq!(target(&location), format!("{TEST_ORIGIN}/sign-in"));
        assert_eq!(
            location_params(&response),
            vec![("return_to".to_owned(), original)]
        );
        assert!(
            header_str(&response, header::LOCATION)
                .unwrap()
                .starts_with(
                    "http://localhost:5173/sign-in?return_to=%2Fauthorize%3Fclient_id%3Dligretto"
                ),
            "{location}"
        );
    }

    /// The first acceptance criterion, end to end: a signed-in account gets
    /// a code and its `state`, and the code redeems for this client and
    /// redirect URI. Replaying the same URL — what the frontend does after
    /// sign-in — completes again, with a new code.
    #[sqlx::test]
    async fn a_signed_in_request_gets_a_code_and_its_state(pool: PgPool) {
        register_ligretto(&pool).await;
        let session = signed_in(&pool).await;
        let state = test_state(pool.clone());
        let router = authorize_router(state.clone());
        let original = uri(&valid());

        let response = send(&router, "GET", &original, Some(&session.cookie)).await;

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_no_store(&response);
        assert_eq!(target(&location(&response)), CALLBACK);
        let params = location_params(&response);
        assert_eq!(
            params
                .iter()
                .map(|(name, _)| name.as_str())
                .collect::<Vec<_>>(),
            ["code", "state"]
        );
        let code = param(&params, "code").unwrap();
        assert_eq!(code.len(), 43);
        assert_eq!(param(&params, "state").as_deref(), Some("st/ate+1"));

        let redeemed = state
            .authorization
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &AuthorizationCode::parse(&code).unwrap(),
                &ClientId::try_new("ligretto").unwrap(),
                CALLBACK,
            )
            .await
            .unwrap();
        assert_eq!(redeemed.account_id, session.account_id);
        assert_eq!(redeemed.session_id, session.session_id);
        assert_eq!(redeemed.scopes, scopes(&["openid", "profile"]));

        let replay = send(&router, "GET", &original, Some(&session.cookie)).await;
        assert_eq!(replay.status(), StatusCode::FOUND);
        let second = param(&location_params(&replay), "code").unwrap();
        assert_ne!(second, code);
    }

    #[sqlx::test]
    async fn a_redirect_uri_with_a_query_gets_the_parameters_appended(pool: PgPool) {
        let registered = "https://app.example/cb?x=1";
        register_public(&pool, "app", registered, true).await;
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool));
        let mut pairs = with("client_id", "app");
        pairs.retain(|(name, _)| *name != "redirect_uri");
        pairs.push(("redirect_uri", registered.to_owned()));

        let response = send(&router, "GET", &uri(&pairs), Some(&session.cookie)).await;

        assert_eq!(response.status(), StatusCode::FOUND);
        let location = header_str(&response, header::LOCATION).unwrap();
        assert!(
            location.starts_with("https://app.example/cb?x=1&code="),
            "{location}"
        );

        pairs.retain(|(name, _)| *name != "response_type");
        let error = send(&router, "GET", &uri(&pairs), None).await;
        let location = header_str(&error, header::LOCATION).unwrap();
        assert!(
            location.starts_with("https://app.example/cb?x=1&error=invalid_request"),
            "{location}"
        );
    }

    async fn assert_page(response: Response, status: StatusCode, code: &str) {
        assert_eq!(response.status(), status, "{code}");
        assert!(!response.headers().contains_key(header::LOCATION), "{code}");
        assert_eq!(
            header_str(&response, header::CONTENT_TYPE),
            Some("text/html; charset=utf-8")
        );
        assert_no_store(&response);
        let body = body(response).await;
        assert!(body.starts_with("<!doctype html>"), "{body}");
        assert!(body.contains(&format!("<code>{code}</code>")), "{body}");
    }

    /// Before the redirect URI is trusted nothing is sent to it: an unknown
    /// client, however it is unknown, and an unregistered redirect URI are
    /// CAS's own page.
    #[sqlx::test]
    async fn an_untrusted_request_gets_a_page_and_no_redirect(pool: PgPool) {
        register_ligretto(&pool).await;
        let router = authorize_router(test_state(pool));

        for pairs in [
            with("client_id", "nope"),
            without("client_id"),
            with("client_id", "Not A Slug"),
            plus("client_id", "ligretto"),
        ] {
            let response = send(&router, "GET", &uri(&pairs), None).await;
            assert_page(response, StatusCode::BAD_REQUEST, "unknown_client").await;
        }

        for pairs in [
            without("redirect_uri"),
            with("redirect_uri", &format!("{CALLBACK}/")),
            with("redirect_uri", "https://evil.example/cb"),
            plus("redirect_uri", CALLBACK),
        ] {
            let response = send(&router, "GET", &uri(&pairs), None).await;
            assert_page(response, StatusCode::BAD_REQUEST, "invalid_redirect_uri").await;
        }
    }

    /// The page renders nothing from the request, and an unknown client is
    /// a warning naming the id as sent, bounded.
    #[sqlx::test]
    async fn an_unknown_client_is_logged_bounded_and_not_rendered(pool: PgPool) {
        let router = authorize_router(test_state(pool));
        let sent = format!("x{}", "y".repeat(200));
        let (events, _guard) = capture_tracing();

        let response = send(&router, "GET", &uri(&with("client_id", &sent)), None).await;

        let body = body(response).await;
        assert!(!body.contains("yyyy"), "{body}");
        let [warning] = &events.mentioning("authorization request refused")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(warning.starts_with("WARN"), "{warning}");
        assert!(warning.contains("unknown_client"), "{warning}");
        assert!(warning.contains(&sent[..64]), "{warning}");
        assert!(!warning.contains(&sent[..65]), "{warning}");
    }

    fn assert_error_redirect(
        response: &Response,
        error: &str,
        description: &str,
        state: Option<&str>,
    ) {
        assert_eq!(response.status(), StatusCode::FOUND, "{error}");
        assert_no_store(response);
        assert_eq!(target(&location(response)), CALLBACK);
        let mut expected = vec![
            ("error".to_owned(), error.to_owned()),
            ("error_description".to_owned(), description.to_owned()),
        ];
        if let Some(state) = state {
            expected.push(("state".to_owned(), state.to_owned()));
        }
        assert_eq!(location_params(response), expected);
    }

    /// After the redirect URI is trusted, a refusal goes back to the client
    /// with the error, a description and the `state`, and nothing else.
    #[sqlx::test]
    async fn an_invalid_request_is_sent_back_with_error_and_state(pool: PgPool) {
        register_ligretto(&pool).await;
        let router = authorize_router(test_state(pool));

        for (pairs, error, description) in [
            (
                with("response_type", "token"),
                "unsupported_response_type",
                "only response_type=code is supported",
            ),
            (
                without("response_type"),
                "invalid_request",
                "response_type is required",
            ),
            (
                with("scope", "openid admin"),
                "invalid_scope",
                "scope admin is not allowed for this client",
            ),
            (
                with("scope", "profile"),
                "invalid_scope",
                "scope must include openid",
            ),
            (
                without("code_challenge"),
                "invalid_request",
                "code_challenge is required",
            ),
            (
                with("code_challenge_method", "plain"),
                "invalid_request",
                "code_challenge_method must be S256",
            ),
        ] {
            let response = send(&router, "GET", &uri(&pairs), None).await;
            assert_error_redirect(&response, error, description, Some("st/ate+1"));
        }

        let response = send(&router, "GET", &uri(&without("state")), None).await;
        assert_error_redirect(&response, "invalid_request", "state is required", None);

        let response = send(&router, "GET", &uri(&plus("state", "again")), None).await;
        assert_error_redirect(
            &response,
            "invalid_request",
            "parameter state is repeated",
            None,
        );
    }

    #[sqlx::test]
    async fn a_public_first_party_client_with_pkce_gets_a_code(pool: PgPool) {
        register_public(&pool, "spa", CALLBACK, true).await;
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool));

        let response = send(
            &router,
            "GET",
            &uri(&with("client_id", "spa")),
            Some(&session.cookie),
        )
        .await;

        assert_eq!(response.status(), StatusCode::FOUND);
        assert!(param(&location_params(&response), "code").is_some());
    }

    /// Consent does not exist yet, so a client that would need it gets no
    /// code, and no row is written.
    #[sqlx::test]
    async fn a_client_that_is_not_first_party_is_unauthorized(pool: PgPool) {
        register_public(&pool, "third", CALLBACK, false).await;
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool.clone()));

        for prompt in [None, Some("none")] {
            let mut pairs = with("client_id", "third");
            if let Some(prompt) = prompt {
                pairs.push(("prompt", prompt.to_owned()));
            }
            let response = send(&router, "GET", &uri(&pairs), Some(&session.cookie)).await;

            assert_error_redirect(
                &response,
                "unauthorized_client",
                "consent is not available yet; only first-party clients can be authorized",
                Some("st/ate+1"),
            );
        }
        // Unchecked query: see docs/TESTS.md.
        let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM authorization_codes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows, 0);
    }

    /// `prompt=none` promises no UI: anonymous is `login_required`, never
    /// the sign-in screen; with a session it changes nothing.
    #[sqlx::test]
    async fn prompt_none_is_honoured(pool: PgPool) {
        register_ligretto(&pool).await;
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool));
        let request = uri(&plus("prompt", "none"));

        let anonymous = send(&router, "GET", &request, None).await;
        assert_error_redirect(
            &anonymous,
            "login_required",
            "the account is not signed in",
            Some("st/ate+1"),
        );

        let signed_in = send(&router, "GET", &request, Some(&session.cookie)).await;
        assert_eq!(signed_in.status(), StatusCode::FOUND);
        assert!(param(&location_params(&signed_in), "code").is_some());
    }

    /// A requirement CAS cannot honour is refused even with a live session:
    /// the session does not satisfy it.
    #[sqlx::test]
    async fn unsupported_requirements_are_refused_with_a_session(pool: PgPool) {
        register_ligretto(&pool).await;
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool));

        for (name, value, error, description) in [
            (
                "prompt",
                "login",
                "invalid_request",
                "prompt=login is not supported",
            ),
            (
                "prompt",
                "consent",
                "invalid_request",
                "prompt=consent is not supported",
            ),
            (
                "prompt",
                "none login",
                "invalid_request",
                "prompt=login is not supported",
            ),
            (
                "max_age",
                "0",
                "invalid_request",
                "max_age is not supported",
            ),
            (
                "id_token_hint",
                "x",
                "invalid_request",
                "id_token_hint is not supported yet",
            ),
            (
                "request",
                "x",
                "request_not_supported",
                "request objects are not supported",
            ),
            (
                "request_uri",
                "x",
                "request_uri_not_supported",
                "request_uri is not supported",
            ),
            (
                "registration",
                "x",
                "registration_not_supported",
                "registration is not supported",
            ),
            (
                "response_mode",
                "fragment",
                "invalid_request",
                "only response_mode=query is supported",
            ),
        ] {
            let response = send(
                &router,
                "GET",
                &uri(&plus(name, value)),
                Some(&session.cookie),
            )
            .await;
            assert_error_redirect(&response, error, description, Some("st/ate+1"));
        }
    }

    #[sqlx::test]
    async fn hints_are_ignored(pool: PgPool) {
        register_ligretto(&pool).await;
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool));
        let mut pairs = valid();
        pairs.extend([
            ("login_hint", "x".to_owned()),
            ("display", "page".to_owned()),
            ("acr_values", "y".to_owned()),
        ]);

        let response = send(&router, "GET", &uri(&pairs), Some(&session.cookie)).await;

        assert_eq!(response.status(), StatusCode::FOUND);
        assert!(param(&location_params(&response), "code").is_some());
    }

    /// A cookie whose session is gone is the same as no cookie here: the
    /// sign-in screen, not a 401.
    #[sqlx::test]
    async fn a_revoked_session_is_anonymous(pool: PgPool) {
        register_ligretto(&pool).await;
        let session = signed_in(&pool).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(session.session_id)
            .execute(&pool)
            .await
            .unwrap();
        let router = authorize_router(test_state(pool));

        let response = send(&router, "GET", &uri(&valid()), Some(&session.cookie)).await;

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_eq!(
            target(&location(&response)),
            format!("{TEST_ORIGIN}/sign-in")
        );
    }

    /// The session is resolved only after validation, so a malformed request
    /// with a valid cookie still gets the page, never JSON.
    #[sqlx::test]
    async fn a_malformed_request_with_a_session_gets_the_page(pool: PgPool) {
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool));

        let response = send(
            &router,
            "GET",
            &uri(&with("client_id", "nope")),
            Some(&session.cookie),
        )
        .await;

        assert_page(response, StatusCode::BAD_REQUEST, "unknown_client").await;
    }

    /// Authorizing an application is using CAS: a session due for renewal is
    /// renewed, and the fresh cookie rides on the redirect.
    #[sqlx::test]
    async fn a_session_due_for_renewal_is_renewed_on_the_redirect(pool: PgPool) {
        register_ligretto(&pool).await;
        let session = signed_in(&pool).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE id = $1")
            .bind(session.session_id)
            .execute(&pool)
            .await
            .unwrap();
        let router = authorize_router(test_state(pool.clone()));

        let response = send(&router, "GET", &uri(&valid()), Some(&session.cookie)).await;

        assert_eq!(response.status(), StatusCode::FOUND);
        assert!(param(&location_params(&response), "code").is_some());
        let set_cookie = header_str(&response, header::SET_COOKIE).expect("a renewed cookie");
        assert!(
            set_cookie.starts_with(&format!("{}=", test_cookies().name())),
            "{set_cookie}"
        );
        // Unchecked query: see docs/TESTS.md.
        let recent: bool = sqlx::query_scalar(
            "SELECT last_seen_at > now() - interval '1 minute' FROM sessions WHERE id = $1",
        )
        .bind(session.session_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(recent, "the idle clock moved");
    }

    /// A database that does not answer while the client is looked up: the
    /// redirect URI is not trusted yet, so a page.
    #[tokio::test]
    async fn an_unavailable_database_before_the_boundary_is_a_503_page() {
        let pool = PgPoolOptions::new()
            .acquire_timeout(Duration::from_secs(1))
            .connect_lazy("postgres://cas:cas@localhost:1/cas")
            .unwrap();
        let router = authorize_router(test_state(pool));

        let response = send(&router, "GET", &uri(&valid()), None).await;

        assert_page(
            response,
            StatusCode::SERVICE_UNAVAILABLE,
            "service_unavailable",
        )
        .await;
    }

    /// The issue line names the row, the client, the account and the
    /// session; the code appears in no event.
    #[sqlx::test]
    async fn the_code_is_never_logged(pool: PgPool) {
        register_ligretto(&pool).await;
        let session = signed_in(&pool).await;
        let router = authorize_router(test_state(pool));
        let (events, _guard) = capture_tracing();

        let response = send(&router, "GET", &uri(&valid()), Some(&session.cookie)).await;

        let code = param(&location_params(&response), "code").unwrap();
        let [line] = &events.mentioning("authorization code issued")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(line.contains("ligretto"), "{line}");
        assert!(line.contains(&session.account_id.to_string()), "{line}");
        assert!(line.contains(&session.session_id.to_string()), "{line}");
        assert!(line.contains("code_id"), "{line}");
        for event in events.all() {
            assert!(
                !event.contains(&code),
                "the code must never be logged: {event}"
            );
        }
    }

    /// Through the whole application: the endpoint is mounted at the root,
    /// answers `GET` only, and refuses a request with no client before any
    /// query (the pool of `app` points at no test database).
    #[tokio::test]
    async fn the_endpoint_is_mounted_at_the_root_for_get_only() {
        let app = crate::http::app(test_config()).unwrap();
        let full = uri(&valid());

        let post = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(&full)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(post.status(), StatusCode::METHOD_NOT_ALLOWED);

        let head = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("HEAD")
                    .uri(&full)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(head.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert!(!head.headers().contains_key(header::LOCATION));
        assert_eq!(header_str(&head, header::ALLOW), Some("GET"));

        for (request, code) in [
            (uri(&without("client_id")), "unknown_client"),
            ("/authorize".to_owned(), "invalid_request"),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(&request)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_page(response, StatusCode::BAD_REQUEST, code).await;
        }

        let under_api = app
            .oneshot(
                Request::builder()
                    .uri("/api/authorize")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(under_api.status(), StatusCode::NOT_FOUND);
        let body = body(under_api).await;
        assert!(body.contains("\"not_found\""), "the /api 404: {body}");
    }
}
