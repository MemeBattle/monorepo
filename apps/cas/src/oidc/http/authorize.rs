//! `GET /oidc/authorize`: the start of the authorization code flow with PKCE
//! (ADR 0010). Served under `/oidc` with `ApiState`, outside `/api`: it is a
//! top-level navigation from another site, which is exactly what the Fetch
//! Metadata line under `/api` refuses.
//!
//! Two channels answer a failure, and which one is decided by whether the
//! redirect URI is trusted yet. Before it is — an unknown client, a
//! redirect URI the client did not register, a request with no parameters —
//! CAS renders a page of its own and never redirects. After it is, every
//! failure goes back to the client as `error`, `error_description` and
//! `state` in the redirect (RFC 6749 §4.1.2.1).
//!
//! A request with an `id_token_hint` is the guest upgrade's way in (ADR
//! 0015 (c), (d)). The hint, when sent, must be a valid, unexpired ID token
//! issued to this client, whatever the session is; a refused one is
//! `invalid_request`. A full session then wins: the code is for the
//! signed-in account and the hint is dropped. Without one, a hint of a guest
//! — or, failing that, an upgrade session the cookie carries — sends the
//! browser to the create-account screen under an upgrade session for that
//! guest, opened here if the cookie does not already carry it. An upgrade
//! session never gets a code. `return_to` never carries the hint on.

use std::collections::BTreeMap;

use axum::{
    extract::{OriginalUri, State},
    http::{Extensions, HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use time::OffsetDateTime;
use tower_http::set_header::SetResponseHeaderLayer;
use url::Url;
use utoipa::openapi::{RefOr, ResponseBuilder, response::Response as OpenApiResponse};
use utoipa_axum::{router::OpenApiRouter, routes};

use super::page::{
    ErrorPage, HeadRefused, found, location_header, method_not_allowed, redirect_with,
};
use crate::db::Failure;
use crate::http::ApiState;
use crate::http::error::ErrorCode;
use crate::http::response::{Documented, error_codes, string_header};
use crate::oidc::HintError;
use crate::oidc::authorization::{self, AuthorizeRequest, OAuthError, PageError, Params};
use crate::oidc::service::IssueError;
use crate::sessions::SessionKind;
use crate::sessions::http::extract::resolve_session;
use crate::sessions::http::with_cookie_renewal;
use crate::sessions::service::CreateError;

/// How much of an unknown `client_id` goes into a log line. The value is
/// the caller's choice, so it is bounded.
const LOGGED_CLIENT_ID_CHARS: usize = 64;

/// `GET /oidc/authorize`, holding `ApiState`. `HEAD` is refused explicitly: axum
/// serves it from the `GET` handler otherwise, and a `HEAD` must not
/// authenticate and mint a code whose response body nobody reads.
///
/// Every answer is `no-store`, because the `Location` of a success carries
/// a code; a route layer, so the root's fallback is not wrapped (see
/// `oidc::http::router`). The cookie renewal layer re-sends the session
/// cookie when resolving the session renewed it, as under `/api`.
pub fn authorize_router(state: ApiState) -> OpenApiRouter {
    with_cookie_renewal(
        OpenApiRouter::new()
            .routes(routes!(authorize, refuse_head))
            .route_layer(SetResponseHeaderLayer::overriding(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-store"),
            ))
            .with_state(state),
    )
}

/// What `/oidc/authorize` answers, for the description: a redirect, or CAS's
/// own page before the redirect URI is trusted.
struct AuthorizeResponses;

impl utoipa::IntoResponses for AuthorizeResponses {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        let codes: Vec<&str> = OAuthError::ALL.iter().map(|error| error.as_str()).collect();
        let redirect = ResponseBuilder::new()
            .description(
                "To the client's redirect URI with `code` and `state`, or with `error`, \
                 `error_description` and `state` (`x-error-codes` lists the `error` values); \
                 or, without a signed-in session, to the frontend's `/sign-in` or, for a \
                 guest upgrade, `/create-account` with `return_to`.",
            )
            .header("Location", location_header())
            .header(
                "Set-Cookie",
                string_header("An upgrade session for a guest's `id_token_hint` (ADR 0015)."),
            )
            .extensions(Some(error_codes(&codes)))
            .build();
        let mut responses = ErrorPage::responses();
        responses.insert(StatusCode::FOUND.as_str().to_owned(), RefOr::T(redirect));
        responses
    }
}

/// The authorization endpoint: the authorization code flow with PKCE.
///
/// The parameters are those of OpenID Connect Core §3.1.2.1 in the query:
/// `client_id`, `redirect_uri`, `response_type=code`, `scope` with `openid`,
/// `state`, `code_challenge` with `code_challenge_method=S256`, and
/// optionally `nonce`, `prompt=none` and `id_token_hint`; they are read by
/// hand under the RFC's rules, a repeated one refused (ADR 0010, ADR 0015).
/// Before the client and its redirect URI are known the answer is CAS's
/// page; after, every answer is a redirect.
#[utoipa::path(get, path = "/oidc/authorize")]
async fn authorize(
    State(state): State<ApiState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    extensions: Extensions,
) -> Documented<AuthorizeResponses> {
    answer(state, uri, headers, extensions).await.into()
}

/// `HEAD /oidc/authorize` is refused: axum would serve it from the `GET`
/// handler, and a `HEAD` must not authenticate and mint a code whose
/// response nobody reads.
#[utoipa::path(head, path = "/oidc/authorize", operation_id = "authorize_head")]
async fn refuse_head() -> Documented<HeadRefused> {
    method_not_allowed("GET").into()
}

async fn answer(
    state: ApiState,
    uri: axum::http::Uri,
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

    // A hint that is sent must be valid, whatever the session is: a client
    // that sent one expects it to be acted on or refused, never ignored for
    // being broken (ADR 0015 (c)).
    let hinted_guest = match &request.id_token_hint {
        None => None,
        Some(hint) => match state
            .upgrade_hints
            .guest(hint, &client.id, OffsetDateTime::now_utc())
            .await
        {
            Ok(guest) => guest,
            Err(HintError::Invalid) => {
                return back.error(OAuthError::InvalidRequest, "id_token_hint is invalid");
            }
            Err(HintError::Expired) => {
                return back.error(OAuthError::InvalidRequest, "id_token_hint has expired");
            }
            Err(HintError::Db(error)) => return back.operational(&error),
        },
    };
    // The hint has done its work once it was judged: it does not travel on
    // into the frontend's URL, and the request the frontend returns to
    // cannot fail on a hint that expired meanwhile.
    let return_to = return_to(&uri, &params, request.id_token_hint.is_some());

    let session = match resolve_session(&state, &headers, &extensions, uri.path()).await {
        Ok(session) => session,
        Err(error) => return back.operational(&error),
    };

    // A full session wins: the browser is signed in to an account, and a
    // link never trades that for a guest. A hint, valid or ignored, is
    // dropped.
    let upgrade_session = match session {
        Some(authenticated) if authenticated.session.kind == SessionKind::Full => {
            return issue(&state, &request, &client, &authenticated, &back).await;
        }
        upgrade_session => upgrade_session,
    };

    // The account to upgrade: the hint's guest, else the guest of the
    // upgrade session the cookie carries (a reload, or `return_to` followed
    // before the ceremony finished).
    let guest_id = hinted_guest
        .as_ref()
        .map(|guest| guest.id)
        .or_else(|| upgrade_session.as_ref().map(|upgrade| upgrade.account.id));
    let Some(guest_id) = guest_id else {
        if request.prompt_none {
            return back.error(OAuthError::LoginRequired, "the account is not signed in");
        }
        return to_frontend(&state.frontend_origin, "/sign-in", &return_to);
    };
    // Registering a passkey is UI, which `prompt=none` promised not to show.
    if request.prompt_none {
        return back.error(OAuthError::LoginRequired, "the account is not signed in");
    }

    let mut response = to_frontend(&state.frontend_origin, "/create-account", &return_to);
    let reused = upgrade_session
        .as_ref()
        .is_some_and(|upgrade| upgrade.account.id == guest_id);
    if !reused {
        let issued = match state.sessions.open_upgrade(guest_id).await {
            Ok(issued) => issued,
            Err(CreateError::Db(error)) => return back.operational(&error),
            Err(CreateError::Random(error)) => {
                tracing::error!(error = %error, "no randomness for an upgrade session");
                return back.error(
                    OAuthError::ServerError,
                    "the server could not complete the request",
                );
            }
        };
        // A handler's own cookie wins over the renewal layer's. The cookie
        // is a token of base64url characters and fixed attributes, so it
        // always parses.
        if let Ok(cookie) = state
            .cookies
            .session(&issued.token, &issued.session)
            .encoded()
            .to_string()
            .parse::<HeaderValue>()
        {
            response.headers_mut().insert(header::SET_COOKIE, cookie);
        }
    }
    response
}

/// Issues the code for a full session's account and sends it back with the
/// request's `state`.
async fn issue(
    state: &ApiState,
    request: &AuthorizeRequest,
    client: &crate::clients::Client,
    authenticated: &crate::sessions::Authenticated,
    back: &Back<'_>,
) -> Response {
    match state
        .authorization
        .issue(request, client, authenticated)
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
        let mut response = self.redirect(&pairs);
        response.extensions_mut().insert(ErrorCode(error.as_str()));
        response
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
        redirect_with(self.redirect_uri, pairs)
    }
}

/// This very request, path and query, relative: where the frontend
/// navigates after its ceremony so that the same request completes with a
/// session (ADR 0010 (c)). As sent, byte for byte — unless it carried an
/// `id_token_hint`, which is left out (ADR 0015 (d)).
fn return_to(uri: &axum::http::Uri, params: &Params, drop_hint: bool) -> String {
    if drop_hint {
        return format!(
            "{}?{}",
            uri.path(),
            params.to_query_without("id_token_hint")
        );
    }
    uri.path_and_query()
        .map_or("/oidc/authorize", |path_and_query| path_and_query.as_str())
        .to_owned()
}

/// `302` to a screen of the frontend — `/sign-in`, or `/create-account` for
/// a guest upgrade (ADR 0015 (d)) — with `return_to`. Nothing is stored.
fn to_frontend(frontend_origin: &Url, path: &str, return_to: &str) -> Response {
    let mut location = frontend_origin.clone();
    location.set_path(path);
    location.set_fragment(None);
    location
        .query_pairs_mut()
        .clear()
        .append_pair("return_to", return_to);
    found(location.as_str())
}

/// A pre-redirect failure, logged and rendered. `client_id` is the value as
/// sent, if any.
fn page(error: PageError, client_id: Option<&str>) -> Response {
    let page = ErrorPage::for_error(error);
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
    let page = ErrorPage::for_database(&error);
    tracing::error!(code = page.code, source = ?error, "authorization request failed");
    page.into_response()
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use axum::Router;
    use axum::body::{Body, to_bytes};
    use axum::http::{Request, StatusCode};
    use sqlx::PgPool;
    use sqlx::postgres::PgPoolOptions;
    use tower::ServiceExt;
    use url::form_urlencoded;

    use super::*;
    use crate::accounts::{Account, AccountRepository, AccountType, NewAccount};
    use crate::clients::Client;
    use crate::clients::{
        ClientId, ClientName, ClientRepository, ClientSecret, NewClient, RedirectUri,
    };
    use crate::db::test_support::db_error;
    use crate::oidc::AuthorizationCode;
    use crate::oidc::authorization::tests::{CALLBACK, CHALLENGE};
    use crate::sessions::{SessionToken, UPGRADE_SESSION_LIFETIME};
    use crate::testing::{
        TEST_ORIGIN, capture_tracing, checked, fresh_signing_key_pem, header_str, scopes,
        session_cookie, signed_id_token, signed_in, test_config, test_cookies, test_signing_key,
        test_state,
    };
    use uuid::Uuid;

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
        format!("/oidc/authorize?{query}")
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
        let router = checked(authorize_router(test_state(pool)));
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
                    "http://localhost:5173/sign-in?return_to=%2Foidc%2Fauthorize%3Fclient_id%3Dligretto"
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
        let session = signed_in(&pool, "Ada").await;
        let state = test_state(pool.clone());
        let router = checked(authorize_router(state.clone()));
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
        assert_eq!(redeemed.account_id, session.account.id);
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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool)));
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
        let router = checked(authorize_router(test_state(pool)));

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
        let router = checked(authorize_router(test_state(pool)));
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
        let router = checked(authorize_router(test_state(pool)));

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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool)));

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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool.clone())));

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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool)));
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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool)));

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
                "id_token_hint is invalid",
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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool)));
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
        let session = signed_in(&pool, "Ada").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(session.session_id)
            .execute(&pool)
            .await
            .unwrap();
        let router = checked(authorize_router(test_state(pool)));

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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool)));

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
        let session = signed_in(&pool, "Ada").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE id = $1")
            .bind(session.session_id)
            .execute(&pool)
            .await
            .unwrap();
        let router = checked(authorize_router(test_state(pool.clone())));

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
        let router = checked(authorize_router(test_state(pool)));

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
        let session = signed_in(&pool, "Ada").await;
        let router = checked(authorize_router(test_state(pool)));
        let (events, _guard) = capture_tracing();

        let response = send(&router, "GET", &uri(&valid()), Some(&session.cookie)).await;

        let code = param(&location_params(&response), "code").unwrap();
        let [line] = &events.mentioning("authorization code issued")[..] else {
            panic!("one line: {:?}", events.all());
        };
        assert!(line.contains("ligretto"), "{line}");
        assert!(line.contains(&session.account.id.to_string()), "{line}");
        assert!(line.contains(&session.session_id.to_string()), "{line}");
        assert!(line.contains("code_id"), "{line}");
        for event in events.all() {
            assert!(
                !event.contains(&code),
                "the code must never be logged: {event}"
            );
        }
    }

    // The guest upgrade (ADR 0015) ---------------------------------------

    async fn ligretto(pool: &PgPool) -> Client {
        register_ligretto(pool).await;
        ClientRepository::new(pool.clone())
            .get(&ClientId::try_new("ligretto").unwrap())
            .await
            .unwrap()
            .unwrap()
    }

    async fn new_guest(pool: &PgPool, number: i64) -> Account {
        AccountRepository::new(pool.clone())
            .create(NewAccount::guest(
                ClientId::try_new("ligretto").unwrap(),
                number,
            ))
            .await
            .unwrap()
    }

    /// A fresh ID token of `account` for `client`, as `/oidc/token` issues it.
    fn hint_for(client: &Client, account: &Account) -> String {
        signed_id_token(
            &test_signing_key(),
            client,
            account,
            &["openid"],
            time::OffsetDateTime::now_utc(),
        )
    }

    /// The upgrade sessions in the table: (account, session id).
    async fn upgrade_rows(pool: &PgPool) -> Vec<(Uuid, Uuid)> {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_as("SELECT account_id, id FROM sessions WHERE kind = 'upgrade'")
            .fetch_all(pool)
            .await
            .unwrap()
    }

    async fn session_count(pool: &PgPool) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar("SELECT count(*) FROM sessions")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    fn cookie_of(token: &SessionToken) -> String {
        format!("{}={}", test_cookies().name(), token.expose())
    }

    /// The frontend screen a redirect goes to, and its `return_to`.
    fn frontend(response: &Response) -> (String, String) {
        assert_eq!(response.status(), StatusCode::FOUND);
        let params = location_params(response);
        assert_eq!(params.len(), 1, "{params:?}");
        (
            target(&location(response)),
            param(&params, "return_to").expect("a return_to"),
        )
    }

    /// The first step of the upgrade: a guest's fresh hint, no session. The
    /// browser goes to create-account under a new upgrade session for the
    /// guest, and `return_to` is the request without the hint.
    #[sqlx::test]
    async fn a_guest_hint_opens_an_upgrade_session_and_sends_to_create_account(pool: PgPool) {
        let client = ligretto(&pool).await;
        let guest = new_guest(&pool, 1).await;
        let router = checked(authorize_router(test_state(pool.clone())));

        let response = send(
            &router,
            "GET",
            &uri(&plus("id_token_hint", &hint_for(&client, &guest))),
            None,
        )
        .await;

        assert_no_store(&response);
        let (screen, return_to) = frontend(&response);
        assert_eq!(screen, format!("{TEST_ORIGIN}/create-account"));
        assert_eq!(return_to, uri(&valid()));
        let token =
            session_cookie(&response, test_cookies().name()).expect("an upgrade session cookie");
        let set_cookie = header_str(&response, header::SET_COOKIE).unwrap();
        let max_age: i64 = set_cookie
            .split("; ")
            .find_map(|attribute| attribute.strip_prefix("Max-Age="))
            .expect("a Max-Age")
            .parse()
            .unwrap();
        assert!(
            max_age <= UPGRADE_SESSION_LIFETIME.as_secs() as i64,
            "{set_cookie}"
        );
        let rows = upgrade_rows(&pool).await;
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].0, guest.id);
        let (authenticated, _) = crate::sessions::SessionService::new(pool)
            .authenticate(&token)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(authenticated.session.id, rows[0].1);
    }

    /// The same request again with the cookie it set — a reload — reuses
    /// the session; a hint of another guest replaces it with one of its own.
    #[sqlx::test]
    async fn a_reload_reuses_the_upgrade_session_and_another_guest_gets_its_own(pool: PgPool) {
        let client = ligretto(&pool).await;
        let guest = new_guest(&pool, 1).await;
        let other = new_guest(&pool, 2).await;
        let router = checked(authorize_router(test_state(pool.clone())));
        let request = uri(&plus("id_token_hint", &hint_for(&client, &guest)));
        let first = send(&router, "GET", &request, None).await;
        let cookie = cookie_of(&session_cookie(&first, test_cookies().name()).unwrap());

        let again = send(&router, "GET", &request, Some(&cookie)).await;

        assert_eq!(frontend(&again).0, format!("{TEST_ORIGIN}/create-account"));
        assert!(!again.headers().contains_key(header::SET_COOKIE));
        assert_eq!(upgrade_rows(&pool).await.len(), 1);

        let switched = send(
            &router,
            "GET",
            &uri(&plus("id_token_hint", &hint_for(&client, &other))),
            Some(&cookie),
        )
        .await;

        assert_eq!(
            frontend(&switched).0,
            format!("{TEST_ORIGIN}/create-account")
        );
        assert!(session_cookie(&switched, test_cookies().name()).is_some());
        let mut guests: Vec<Uuid> = upgrade_rows(&pool)
            .await
            .into_iter()
            .map(|(account, _)| account)
            .collect();
        guests.sort();
        let mut expected = vec![guest.id, other.id];
        expected.sort();
        assert_eq!(guests, expected);
    }

    /// The upgrade session alone — `return_to` followed before the ceremony
    /// finished — goes back to create-account; with `prompt=none` it is
    /// `login_required`. It never gets a code.
    #[sqlx::test]
    async fn an_upgrade_session_never_gets_a_code(pool: PgPool) {
        let client = ligretto(&pool).await;
        let guest = new_guest(&pool, 1).await;
        let router = checked(authorize_router(test_state(pool.clone())));
        let first = send(
            &router,
            "GET",
            &uri(&plus("id_token_hint", &hint_for(&client, &guest))),
            None,
        )
        .await;
        let cookie = cookie_of(&session_cookie(&first, test_cookies().name()).unwrap());

        let response = send(&router, "GET", &uri(&valid()), Some(&cookie)).await;
        let (screen, return_to) = frontend(&response);
        assert_eq!(screen, format!("{TEST_ORIGIN}/create-account"));
        assert_eq!(return_to, uri(&valid()));
        assert!(!response.headers().contains_key(header::SET_COOKIE));

        let silent = send(&router, "GET", &uri(&plus("prompt", "none")), Some(&cookie)).await;
        assert_error_redirect(
            &silent,
            "login_required",
            "the account is not signed in",
            Some("st/ate+1"),
        );
        // Unchecked query: see docs/TESTS.md.
        let codes: i64 = sqlx::query_scalar("SELECT count(*) FROM authorization_codes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(codes, 0);
    }

    /// A hint that is not an ID token CAS issued to this client is refused
    /// with a fixed description and the `state`, and opens nothing.
    #[sqlx::test]
    async fn a_tampered_foreign_or_misaddressed_hint_is_invalid_request(pool: PgPool) {
        let client = ligretto(&pool).await;
        register_public(&pool, "other", CALLBACK, true).await;
        let other_client = ClientRepository::new(pool.clone())
            .get(&ClientId::try_new("other").unwrap())
            .await
            .unwrap()
            .unwrap();
        let guest = new_guest(&pool, 1).await;
        let router = checked(authorize_router(test_state(pool.clone())));
        let valid_hint = hint_for(&client, &guest);
        let mut segments: Vec<String> = valid_hint.split('.').map(str::to_owned).collect();
        segments[2] = hint_for(&other_client, &guest)
            .rsplit('.')
            .next()
            .unwrap()
            .to_owned();
        let tampered = segments.join(".");
        let claims = crate::oidc::IdTokenClaims::new(
            "https://other.example",
            &client,
            &guest,
            &scopes(&["openid"]),
            None,
            time::OffsetDateTime::now_utc(),
        );
        let foreign_issuer = test_signing_key().sign("JWT", &serde_json::to_vec(&claims).unwrap());
        let unknown_key = crate::oidc::SigningKeys::from_pem(&fresh_signing_key_pem())
            .unwrap()
            .active()
            .clone();
        let unknown = signed_id_token(
            &unknown_key,
            &client,
            &guest,
            &["openid"],
            time::OffsetDateTime::now_utc(),
        );

        for hint in [
            tampered,
            foreign_issuer,
            unknown,
            hint_for(&other_client, &guest),
        ] {
            let response = send(&router, "GET", &uri(&plus("id_token_hint", &hint)), None).await;
            assert_error_redirect(
                &response,
                "invalid_request",
                "id_token_hint is invalid",
                Some("st/ate+1"),
            );
            assert!(!response.headers().contains_key(header::SET_COOKIE));
        }
        assert_eq!(session_count(&pool).await, 0);
    }

    #[sqlx::test]
    async fn an_expired_hint_is_invalid_request(pool: PgPool) {
        let client = ligretto(&pool).await;
        let guest = new_guest(&pool, 1).await;
        let router = checked(authorize_router(test_state(pool.clone())));
        let expired = signed_id_token(
            &test_signing_key(),
            &client,
            &guest,
            &["openid"],
            time::OffsetDateTime::now_utc() - time::Duration::minutes(11),
        );

        let response = send(&router, "GET", &uri(&plus("id_token_hint", &expired)), None).await;

        assert_error_redirect(
            &response,
            "invalid_request",
            "id_token_hint has expired",
            Some("st/ate+1"),
        );
        assert_eq!(session_count(&pool).await, 0);
    }

    /// A hint of a full account, or of an account that is gone, is ignored:
    /// the anonymous path, with a `return_to` that no longer carries it, so
    /// the request the frontend comes back to after signing in gets a code
    /// even once the hint has expired.
    #[sqlx::test]
    async fn a_full_or_unknown_accounts_hint_is_ignored_and_dropped(pool: PgPool) {
        let client = ligretto(&pool).await;
        let full = signed_in(&pool, "Ada").await;
        let mut unknown = full.account.clone();
        unknown.id = Uuid::new_v4();
        let router = checked(authorize_router(test_state(pool.clone())));

        for account in [&full.account, &unknown] {
            let response = send(
                &router,
                "GET",
                &uri(&plus("id_token_hint", &hint_for(&client, account))),
                None,
            )
            .await;

            let (screen, return_to) = frontend(&response);
            assert_eq!(screen, format!("{TEST_ORIGIN}/sign-in"));
            assert_eq!(return_to, uri(&valid()));
            assert!(!return_to.contains("id_token_hint"));
            assert!(!response.headers().contains_key(header::SET_COOKIE));

            let resumed = send(&router, "GET", &return_to, Some(&full.cookie)).await;
            assert_eq!(target(&location(&resumed)), CALLBACK);
            assert!(param(&location_params(&resumed), "code").is_some());
        }
        assert!(upgrade_rows(&pool).await.is_empty());
    }

    /// A browser signed in to an account keeps it: the code is for that
    /// account, nothing is opened, and the guest stays a guest.
    #[sqlx::test]
    async fn a_full_session_wins_over_a_guest_hint(pool: PgPool) {
        let client = ligretto(&pool).await;
        let guest = new_guest(&pool, 1).await;
        let session = signed_in(&pool, "Ada").await;
        let state = test_state(pool.clone());
        let router = checked(authorize_router(state.clone()));

        let response = send(
            &router,
            "GET",
            &uri(&plus("id_token_hint", &hint_for(&client, &guest))),
            Some(&session.cookie),
        )
        .await;

        assert_eq!(target(&location(&response)), CALLBACK);
        let code = param(&location_params(&response), "code").unwrap();
        let redeemed = state
            .authorization
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &AuthorizationCode::parse(&code).unwrap(),
                &client.id,
                CALLBACK,
            )
            .await
            .unwrap();
        assert_eq!(redeemed.account_id, session.account.id);
        assert!(upgrade_rows(&pool).await.is_empty());
        let still = AccountRepository::new(pool).get(guest.id).await.unwrap();
        assert_eq!(still.unwrap().r#type, AccountType::Guest);
    }

    /// `prompt=none` promised no UI, and registering a passkey is UI.
    #[sqlx::test]
    async fn prompt_none_with_a_guest_hint_is_login_required(pool: PgPool) {
        let client = ligretto(&pool).await;
        let guest = new_guest(&pool, 1).await;
        let router = checked(authorize_router(test_state(pool.clone())));
        let mut pairs = plus("id_token_hint", &hint_for(&client, &guest));
        pairs.push(("prompt", "none".to_owned()));

        let response = send(&router, "GET", &uri(&pairs), None).await;

        assert_error_redirect(
            &response,
            "login_required",
            "the account is not signed in",
            Some("st/ate+1"),
        );
        assert_eq!(session_count(&pool).await, 0);
    }

    /// The hint is a bearer credential: no event carries it, accepted or
    /// refused.
    #[sqlx::test]
    async fn the_hint_is_never_logged(pool: PgPool) {
        let client = ligretto(&pool).await;
        let guest = new_guest(&pool, 1).await;
        let router = checked(authorize_router(test_state(pool)));
        let fresh = hint_for(&client, &guest);
        let expired = signed_id_token(
            &test_signing_key(),
            &client,
            &guest,
            &["openid"],
            time::OffsetDateTime::now_utc() - time::Duration::minutes(11),
        );
        let (events, _guard) = capture_tracing();

        for hint in [&fresh, &expired] {
            send(&router, "GET", &uri(&plus("id_token_hint", hint)), None).await;
        }

        assert!(!events.all().is_empty());
        for event in events.all() {
            for hint in [&fresh, &expired] {
                assert!(!event.contains(hint.as_str()), "{event}");
                // Nor any of its segments, the signature included.
                for segment in hint.split('.') {
                    assert!(!event.contains(segment), "{event}");
                }
            }
        }
    }

    /// Through the whole application: the endpoint is mounted under `/oidc`,
    /// answers `GET` only, and refuses a request with no client before any
    /// query (the pool of `app` points at no test database).
    #[tokio::test]
    async fn the_endpoint_is_mounted_under_oidc_for_get_only() {
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
            ("/oidc/authorize".to_owned(), "invalid_request"),
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
