//! The two wire surfaces of an external identity flow.
//!
//! Starting one is a first-party call the frontend makes, so it lives under
//! `/api` and gets that mount's contract by being nested there: the Fetch
//! Metadata line, `no-store`, the `ApiError` shape. `POST
//! /api/identities/{provider}/sign-in-options` is anonymous; `POST
//! /api/identities/{provider}/link-options` takes `Authenticated`, and the
//! account the flow is for comes from the session, never from the request.
//! Both answer with the provider's URL for the frontend to navigate to, and
//! both set the flow cookie.
//!
//! Finishing one is a top-level navigation from the provider — exactly what
//! the Fetch Metadata line refuses — so `GET
//! /identities/{provider}/callback` is mounted at the root, alongside
//! `/oidc/authorize`, and answers like it: a `302` on success, CAS's own
//! error page with a stable code on failure (ADR 0023 (h)). One callback per
//! provider, with the intent read from the flow row rather than the URL, so
//! the redirect URI a provider registers stays one stable address.

pub(crate) mod cookie;

use std::collections::BTreeMap;

use axum::{
    extract::{OriginalUri, State, rejection::PathRejection},
    http::{Extensions, HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use axum_extra::extract::cookie::Cookie;
use serde::{Deserialize, Serialize};
use tower_http::set_header::SetResponseHeaderLayer;
use url::{Url, form_urlencoded};
use utoipa::openapi::{RefOr, ResponseBuilder, response::Response as OpenApiResponse};
use utoipa::{OpenApi, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use crate::http::ApiState;
use crate::http::error::ApiErrors;
use crate::http::extract::{InvalidBody, Json};
use crate::http::page::{ErrorPage, HeadRefused, found, location_header, method_not_allowed};
use crate::http::response::{Documented, on_success, string_header};
use crate::identities::Intent;
use crate::identities::service::{Callback, FinishError, Finished, StartError};
use crate::sessions::Authenticated;
use crate::sessions::http::extract::resolve_session;
use crate::sessions::http::with_cookie_renewal;

crate::api_errors! { StartError {
    UnknownProvider => NOT_FOUND "unknown_provider",
    InvalidReturnTo => BAD_REQUEST "invalid_return_to",
    // The OS refusing to provide randomness is nothing this code can name a
    // remedy for.
    Random(_) => internal,
    Db(_) => from,
} }

/// The pages the callback answers, each for a condition the code can name.
/// The family's fallback is added by [`ErrorPage::responses`].
const CALLBACK_PAGES: [ErrorPage; 8] = [
    FLOW_NOT_FOUND,
    FOREIGN_FLOW,
    PROVIDER_DENIED,
    PROVIDER_EXCHANGE_FAILED,
    PROVIDER_UNAVAILABLE,
    LINK_SESSION_MISMATCH,
    IDENTITY_ALREADY_LINKED,
    ErrorPage::SERVICE_UNAVAILABLE,
];

/// Unknown, expired, already used, or minted for another provider: one page
/// for all of them, because the remedy is the same and the browser learns
/// nothing about which flows exist.
const FLOW_NOT_FOUND: ErrorPage = ErrorPage {
    status: StatusCode::BAD_REQUEST,
    code: "flow_not_found",
    title: "Sign-in attempt not found",
    description: "This sign-in attempt is unknown or has expired. Start again.",
};

const FOREIGN_FLOW: ErrorPage = ErrorPage {
    status: StatusCode::BAD_REQUEST,
    code: "foreign_flow",
    title: "Sign-in attempt from another browser",
    description: "This sign-in attempt was not started in this browser. Start again.",
};

const PROVIDER_DENIED: ErrorPage = ErrorPage {
    status: StatusCode::BAD_REQUEST,
    code: "provider_denied",
    title: "Not authorized",
    description: "The provider did not authorize the request.",
};

const PROVIDER_EXCHANGE_FAILED: ErrorPage = ErrorPage {
    status: StatusCode::BAD_REQUEST,
    code: "provider_exchange_failed",
    title: "Sign-in could not be completed",
    description: "The provider refused to confirm this sign-in. Start again.",
};

const PROVIDER_UNAVAILABLE: ErrorPage = ErrorPage {
    status: StatusCode::SERVICE_UNAVAILABLE,
    code: "provider_unavailable",
    title: "Provider unavailable",
    description: "The provider could not be reached. Try again later.",
};

const LINK_SESSION_MISMATCH: ErrorPage = ErrorPage {
    status: StatusCode::FORBIDDEN,
    code: "link_session_mismatch",
    title: "Wrong account",
    description: "This link was started for another account. Sign in to that account and try again.",
};

const IDENTITY_ALREADY_LINKED: ErrorPage = ErrorPage {
    status: StatusCode::CONFLICT,
    code: "identity_already_linked",
    title: "Already linked",
    description: "This provider account is already linked to an account.",
};

/// The response bodies of `/api/identities`, for the description.
#[derive(OpenApi)]
#[openapi(components(schemas(FlowStartRequest, FlowStartResponse)))]
struct IdentitiesApi;

/// `/api/identities` — starting a flow. Nested by the transport root, so the
/// `/api` contract and the cookie renewal layer apply.
pub fn router(state: ApiState) -> OpenApiRouter {
    OpenApiRouter::with_openapi(IdentitiesApi::openapi())
        .routes(routes!(sign_in_options))
        .routes(routes!(link_options))
        .with_state(state)
}

/// `GET /identities/{provider}/callback`, at the root: a navigation from the
/// provider, outside `/api`. `HEAD` is refused explicitly — axum would serve
/// it from the `GET` handler, and a `HEAD` must not consume a flow and open a
/// session whose response nobody reads.
///
/// Wrapped in the cookie renewal layer, like `/oidc/authorize`: resolving the
/// session may renew it, and the fresh cookie has to reach the browser beside
/// the flow cookie this handler clears. Every answer is `no-store` — a
/// success carries a session cookie — through a route layer, so the root's
/// fallback is not wrapped.
pub fn callback_router(state: ApiState) -> OpenApiRouter {
    with_cookie_renewal(
        OpenApiRouter::new()
            .routes(routes!(callback, refuse_head))
            .route_layer(SetResponseHeaderLayer::overriding(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-store"),
            ))
            .with_state(state),
    )
}

/// What a start endpoint takes. `returnTo` is where the browser should end up
/// once the flow finishes: a path on the frontend, defaulted when absent.
#[derive(Debug, Default, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FlowStartRequest {
    /// A path, such as `/dashboard`. Anything that could send the browser
    /// off-site is refused rather than repaired.
    #[serde(default)]
    #[schema(required = false)]
    return_to: Option<String>,
}

/// Where the frontend navigates to hand the browser over to the provider.
#[derive(Debug, Serialize, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FlowStartResponse {
    url: String,
}

/// A response that also gives the browser the flow cookie. Described as `R`
/// with a `Set-Cookie` header on its success.
pub struct WithFlowCookie<R>(Cookie<'static>, R);

impl<R: IntoResponse> IntoResponse for WithFlowCookie<R> {
    fn into_response(self) -> Response {
        let Self(cookie, inner) = self;
        let mut response = inner.into_response();
        if let Ok(value) = cookie.encoded().to_string().parse() {
            response.headers_mut().append(header::SET_COOKIE, value);
        }
        response
    }
}

impl<R: utoipa::IntoResponses> utoipa::IntoResponses for WithFlowCookie<R> {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        on_success(
            R::responses(),
            "Set-Cookie",
            string_header(
                "The one-time flow cookie (`cas_identity_flow`, \
                 `__Host-cas_identity_flow` on an https origin): HttpOnly, \
                 SameSite=Lax, Path=/. The callback refuses a flow without it.",
            ),
        )
    }
}

crate::error_set!(SignInOptionsErrors: InvalidBody, StartError);

/// Starts a sign-in with an external provider and answers with the address
/// to send the browser to.
///
/// Anonymous: signing in is what a browser with no session does. The flow
/// cookie comes back with the URL, and the callback refuses a `state` without
/// it.
#[utoipa::path(
    post,
    path = "/{provider}/sign-in-options",
    operation_id = "start_identity_sign_in",
    params(("provider" = String, Path, description = "The provider's slug.")),
)]
async fn sign_in_options(
    State(state): State<ApiState>,
    provider: Result<axum::extract::Path<String>, PathRejection>,
    Json(body): Json<FlowStartRequest>,
) -> Result<WithFlowCookie<Json<FlowStartResponse>>, ApiErrors<SignInOptionsErrors>> {
    let provider = slug(provider).ok_or(StartError::UnknownProvider)?;
    let started = state
        .identities
        .start(&provider, Intent::SignIn, None, body.return_to.as_deref())
        .await?;

    Ok(WithFlowCookie(
        cookie::flow(&state.cookies, &started.secret),
        Json(FlowStartResponse {
            url: started.url.into(),
        }),
    ))
}

crate::error_set!(LinkOptionsErrors: Authenticated, InvalidBody, StartError);

/// Starts linking an external provider to the signed-in account.
///
/// The account comes from the session and is written into the flow row: the
/// callback finishes the link only under a session naming that same account
/// (ADR 0023 (f)).
#[utoipa::path(
    post,
    path = "/{provider}/link-options",
    operation_id = "start_identity_link",
    params(("provider" = String, Path, description = "The provider's slug.")),
    security(("session" = []))
)]
async fn link_options(
    State(state): State<ApiState>,
    authenticated: Authenticated,
    provider: Result<axum::extract::Path<String>, PathRejection>,
    Json(body): Json<FlowStartRequest>,
) -> Result<WithFlowCookie<Json<FlowStartResponse>>, ApiErrors<LinkOptionsErrors>> {
    let provider = slug(provider).ok_or(StartError::UnknownProvider)?;
    let started = state
        .identities
        .start(
            &provider,
            Intent::Link,
            Some(authenticated.account.id),
            body.return_to.as_deref(),
        )
        .await?;

    Ok(WithFlowCookie(
        cookie::flow(&state.cookies, &started.secret),
        Json(FlowStartResponse {
            url: started.url.into(),
        }),
    ))
}

/// The provider's slug as the path carried it, or `None` for a segment that
/// could not be read at all — which names no provider either, so it answers
/// the same way an unregistered one does.
fn slug(provider: Result<axum::extract::Path<String>, PathRejection>) -> Option<String> {
    provider.ok().map(|axum::extract::Path(slug)| slug)
}

/// What the provider appended to the callback's address.
///
/// Read by hand rather than through an extractor, so that nothing here can
/// answer with a rejection the description does not declare: a callback
/// without a readable `state` names no flow, and that is the answer it gets.
/// A repeated parameter keeps its first value — a provider sends each once,
/// and picking the last would let an appended copy decide.
#[derive(Debug, Default)]
struct CallbackQuery {
    state: Option<String>,
    code: Option<String>,
    /// Present instead of `code` when the provider refused (RFC 6749
    /// §4.1.2.1).
    error: Option<String>,
}

impl CallbackQuery {
    fn from_query(query: Option<&str>) -> Self {
        let mut parsed = Self::default();
        for (key, value) in form_urlencoded::parse(query.unwrap_or_default().as_bytes()) {
            let field = match key.as_ref() {
                "state" => &mut parsed.state,
                "code" => &mut parsed.code,
                "error" => &mut parsed.error,
                _ => continue,
            };
            field.get_or_insert_with(|| value.into_owned());
        }
        parsed
    }
}

/// What the callback answers, for the description.
struct CallbackResponses;

impl utoipa::IntoResponses for CallbackResponses {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        let redirect = ResponseBuilder::new()
            .description(
                "To the frontend at the flow's `return_to`: with the session cookie after a \
                 sign-in, with nothing new after a link. The flow this request consumed is \
                 spent, so its cookie is cleared.",
            )
            .header("Location", location_header())
            .header(
                "Set-Cookie",
                string_header(
                    "The removal of the flow cookie, the session cookie of the account that \
                     signed in, and the renewal of an existing session cookie when one was due.",
                ),
            )
            .build();
        let mut responses = ErrorPage::responses(&CALLBACK_PAGES);
        responses.insert(StatusCode::FOUND.as_str().to_owned(), RefOr::T(redirect));
        responses
    }
}

/// Where the provider sends the browser back: finishes the flow the `state`
/// names and sends the browser on to the frontend.
#[utoipa::path(
    get,
    path = "/identities/{provider}/callback",
    operation_id = "identity_callback",
    params(("provider" = String, Path, description = "The provider's slug.")),
)]
async fn callback(
    State(state): State<ApiState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    extensions: Extensions,
    provider: Result<axum::extract::Path<String>, PathRejection>,
) -> Documented<CallbackResponses> {
    let query = CallbackQuery::from_query(uri.query());
    answer(state, uri, headers, extensions, slug(provider), query)
        .await
        .into()
}

/// `HEAD /identities/{provider}/callback` is refused: axum would serve it
/// from the `GET` handler, and a `HEAD` must not consume a flow.
#[utoipa::path(
    head,
    path = "/identities/{provider}/callback",
    operation_id = "identity_callback_head",
    params(("provider" = String, Path, description = "The provider's slug.")),
)]
async fn refuse_head() -> Documented<HeadRefused> {
    method_not_allowed("GET").into()
}

async fn answer(
    state: ApiState,
    uri: axum::http::Uri,
    headers: HeaderMap,
    extensions: Extensions,
    provider: Option<String>,
    query: CallbackQuery,
) -> Response {
    // A request that consumes no flow of this browser's leaves its flow
    // cookie alone. The browser holds one at a time, so that cookie belongs
    // to whichever flow is current — possibly one still running, started in
    // another tab — and clearing it would make that flow's own callback a
    // `foreign_flow`. Any navigation to this address, from anywhere, would
    // otherwise be enough to break a live flow.
    let Some((provider, state_id)) = provider.zip(
        query
            .state
            .as_deref()
            .and_then(|value| Uuid::parse_str(value).ok()),
    ) else {
        return page(FLOW_NOT_FOUND, None);
    };
    let callback = match (query.error.as_deref(), query.code) {
        // A refusal is the provider's answer and consumes the flow.
        (Some(_), _) => Callback::Denied,
        (None, Some(code)) => Callback::Code(code),
        // Neither half: nothing a provider sends, and nothing to act on.
        (None, None) => return page(FLOW_NOT_FOUND, None),
    };

    // The session a link flow is held to, resolved before the flow is
    // consumed so that a renewal it triggers reaches the slot.
    let current_account = match resolve_session(&state, &headers, &extensions, uri.path()).await {
        Ok(session) => session.map(|authenticated| authenticated.account.id),
        Err(error) => return database_page(&error, None),
    };
    let presented = cookie::presented(&state.cookies, &headers);

    // Past the cookie check the flow this request consumed is the one the
    // presented cookie was bound to, so the cookie is spent and goes out
    // cleared — on the success and on every failure of the phases after it.
    let clear = cookie::removal(&state.cookies);

    match state
        .identities
        .finish(
            &provider,
            state_id,
            callback,
            presented.as_deref(),
            current_account,
        )
        .await
    {
        Ok(finished) => succeed(&state, finished, &clear),
        // No row was consumed at all: the `state` named no live flow, so the
        // cookie the browser presented belongs to some other flow.
        Err(FinishError::FlowNotFound) => page(FLOW_NOT_FOUND, None),
        // A flow was consumed, but not the one this cookie is bound to —
        // which is the whole reason the cookie must survive.
        Err(FinishError::ForeignFlow) => page(FOREIGN_FLOW, None),
        Err(FinishError::ProviderDenied) => page(PROVIDER_DENIED, Some(&clear)),
        Err(FinishError::SessionMismatch) => page(LINK_SESSION_MISMATCH, Some(&clear)),
        Err(FinishError::AlreadyLinked) => page(IDENTITY_ALREADY_LINKED, Some(&clear)),
        Err(FinishError::Exchange(error)) => {
            let page_for = match &error {
                crate::identities::ExchangeError::Rejected(_) => PROVIDER_EXCHANGE_FAILED,
                crate::identities::ExchangeError::Unavailable(_) => PROVIDER_UNAVAILABLE,
            };
            tracing::warn!(code = page_for.code, error = %error, "an identity exchange failed");
            page(page_for, Some(&clear))
        }
        // A conflict that vanished again: the condition is retryable, and it
        // takes the page CAS already answers for "there, but cannot serve".
        Err(FinishError::Contended) => {
            tracing::warn!("an identity sign-in lost a race it could not resolve");
            page(ErrorPage::SERVICE_UNAVAILABLE, Some(&clear))
        }
        Err(FinishError::Random(error)) => {
            tracing::error!(error = %error, "no randomness for a session");
            page(ErrorPage::INTERNAL, Some(&clear))
        }
        // The failure may be the consume itself, so which flow the cookie
        // belongs to is unknown. A spent cookie left behind is harmless — its
        // row went with it — while clearing a live flow's is not.
        Err(FinishError::Db(error)) => database_page(&error, None),
    }
}

/// The `302` to the frontend, with the cookies the intent calls for.
fn succeed(state: &ApiState, finished: Finished, clear: &Cookie<'static>) -> Response {
    let mut response = to_frontend(&state.frontend_origin, finished.return_to());
    add_cookie(&mut response, clear);

    if let Finished::SignedIn { session, .. } = &finished {
        add_cookie(
            &mut response,
            &state.cookies.session(&session.token, &session.session),
        );
    }
    response
}

/// `302` to the frontend at `return_to`, which the service validated as a
/// path: joining it onto the origin can therefore only change the path and
/// the query.
fn to_frontend(frontend_origin: &Url, return_to: &str) -> Response {
    match frontend_origin.join(return_to) {
        Ok(location) if location.origin() == frontend_origin.origin() => found(location.as_str()),
        // Unreachable for a validated path, and a redirect off the frontend's
        // origin is the one thing this must never emit.
        _ => {
            tracing::error!(return_to, "a validated return_to left the frontend origin");
            found(frontend_origin.as_str())
        }
    }
}

/// A page, with the flow cookie cleared beside it when this answer spent it
/// and left alone when it did not.
fn page(page: ErrorPage, clear: Option<&Cookie<'static>>) -> Response {
    let mut response = page.into_response();
    if let Some(clear) = clear {
        add_cookie(&mut response, clear);
    }
    response
}

/// A database failure, logged and rendered as a page like every other
/// failure here.
fn database_page(error: &sqlx::Error, clear: Option<&Cookie<'static>>) -> Response {
    let for_database = ErrorPage::for_database(error);
    tracing::error!(code = for_database.code, source = ?error, "an identity callback failed");
    page(for_database, clear)
}

/// Appends a `Set-Cookie`, leaving the ones already on the response — the
/// renewal layer appends too, so nothing here may overwrite.
fn add_cookie(response: &mut Response, cookie: &Cookie<'static>) {
    // A cookie built from base64url characters and fixed attributes always
    // parses as a header value.
    if let Ok(value) = cookie.encoded().to_string().parse() {
        response.headers_mut().append(header::SET_COOKIE, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use axum::body::{Body, to_bytes};
    use axum::http::Request;
    use sqlx::PgPool;
    use tower::ServiceExt;

    use crate::identities::provider::Provider;
    use crate::identities::{ProfileSnapshot, Providers};
    use crate::sessions::{SESSION_IDLE_TIMEOUT, as_time};
    use crate::testing::{
        FakeProvider, checked, header_str, register_soft_passkey, session_cookie, signed_in,
        test_cookies, test_origin, test_state, test_state_with_providers,
    };

    const SLUG: &str = "telegram";

    fn profile() -> ProfileSnapshot {
        ProfileSnapshot::new(
            Some("Ada Lovelace".to_owned()),
            Some("ada".to_owned()),
            Some("https://provider.test/ada.png".to_owned()),
        )
    }

    fn fake() -> Arc<FakeProvider> {
        Arc::new(FakeProvider::new(SLUG).answering("42", profile()))
    }

    /// The state with `provider` registered, as the one deployment that has
    /// any: production registers none until #754.
    fn state_with(pool: PgPool, provider: &Arc<FakeProvider>) -> ApiState {
        test_state_with_providers(
            pool,
            Providers::new([Arc::clone(provider) as Arc<dyn Provider>]),
        )
    }

    /// Both mounts of the context behind the conformance check: the start
    /// endpoints where `/api` nests them, under the cookie renewal layer that
    /// mount carries, and the callback at the root, where the transport root
    /// merges it.
    fn both_mounts(state: ApiState) -> axum::Router {
        checked(
            OpenApiRouter::new()
                .nest(
                    "/api/identities",
                    with_cookie_renewal(router(state.clone())),
                )
                .merge(callback_router(state)),
        )
    }

    fn request(method: &str, uri: &str, cookies: &[&str], body: Option<&str>) -> Request<Body> {
        let mut request = Request::builder().method(method).uri(uri);
        if !cookies.is_empty() {
            request = request.header(header::COOKIE, cookies.join("; "));
        }
        match body {
            Some(body) => request
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_owned()))
                .unwrap(),
            None => request.body(Body::empty()).unwrap(),
        }
    }

    async fn body_text(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    async fn body_json(response: Response) -> serde_json::Value {
        serde_json::from_str(&body_text(response).await).unwrap()
    }

    /// The cookie a response sets under `name`, if it sets one. The callback
    /// sets up to three, so a test cannot read the one header and be done.
    fn cookie_named(response: &Response, name: &str) -> Option<Cookie<'static>> {
        response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .filter_map(|value| Cookie::parse(value.to_owned()).ok())
            .find(|cookie| cookie.name() == name)
    }

    fn flow_cookie_name() -> &'static str {
        cookie::name(&test_cookies())
    }

    /// A started flow as the browser now holds it: where to go, the `state`
    /// in it, and the `Cookie` header to send back.
    struct Started {
        state: Uuid,
        cookie: String,
        response: Response,
    }

    /// Starts a flow through the endpoint and reads what the browser got.
    async fn start(
        app: &axum::Router,
        app_path: &str,
        session: Option<&str>,
        body: &str,
    ) -> Started {
        let cookies: Vec<&str> = session.into_iter().collect();
        let response = app
            .clone()
            .oneshot(request("POST", app_path, &cookies, Some(body)))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{app_path}");

        let flow = cookie_named(&response, flow_cookie_name()).expect("the flow cookie is set");
        let cookie = format!("{}={}", flow.name(), flow.value());
        let (parts, body) = response.into_parts();
        let bytes = to_bytes(body, usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let url: Url = json["url"].as_str().expect("a url").parse().unwrap();
        let state = url
            .query_pairs()
            .find(|(key, _)| key == "state")
            .map(|(_, value)| value.parse().expect("a uuid"))
            .expect("the authorization URL carries a state");

        Started {
            state,
            cookie,
            response: Response::from_parts(parts, Body::from(bytes)),
        }
    }

    fn callback_uri(provider: &str, query: &str) -> String {
        format!("/identities/{provider}/callback?{query}")
    }

    /// What a page does to the browser's flow cookie. Only an answer that
    /// consumed the flow the cookie is bound to may clear it; the others have
    /// to leave whichever flow the browser is holding alone.
    #[derive(Debug, Clone, Copy)]
    enum FlowCookie {
        Cleared,
        Untouched,
    }

    async fn assert_page(response: Response, status: StatusCode, code: &str, flow: FlowCookie) {
        assert_eq!(response.status(), status, "{code}");
        assert!(!response.headers().contains_key(header::LOCATION), "{code}");
        assert_eq!(
            header_str(&response, header::CONTENT_TYPE),
            Some("text/html; charset=utf-8"),
            "{code}"
        );
        let set =
            cookie_named(&response, flow_cookie_name()).map(|cookie| cookie.value().to_owned());
        match flow {
            FlowCookie::Cleared => assert_eq!(
                set,
                Some(String::new()),
                "{code}: a spent flow's cookie is cleared"
            ),
            FlowCookie::Untouched => assert_eq!(
                set, None,
                "{code}: this answer consumed no flow of this browser's, so its cookie stays"
            ),
        }
        let body = body_text(response).await;
        assert!(body.starts_with("<!doctype html>"), "{body}");
        assert!(body.contains(&format!("<code>{code}</code>")), "{body}");
    }

    /// Unchecked query: see docs/TESTS.md.
    async fn sessions_of(pool: &PgPool, account_id: Uuid) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM sessions WHERE account_id = $1")
            .bind(account_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Moves a session's last use into the past, so the next request renews
    /// it. Unchecked query: see docs/TESTS.md.
    async fn last_seen(pool: &PgPool, id: Uuid, ago: &str) {
        sqlx::query("UPDATE sessions SET last_seen_at = now() - $2::interval WHERE id = $1")
            .bind(id)
            .bind(ago)
            .execute(pool)
            .await
            .unwrap();
    }

    /// The sign-in intent, end to end: the acceptance criterion.
    #[sqlx::test]
    async fn signing_in_with_a_provider_creates_the_account_and_opens_a_session(pool: PgPool) {
        let provider = fake();
        let app = both_mounts(state_with(pool.clone(), &provider));

        let started = start(
            &app,
            "/api/identities/telegram/sign-in-options",
            None,
            r#"{"returnTo":"/dashboard"}"#,
        )
        .await;
        let response = app
            .clone()
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=the-code", started.state)),
                &[&started.cookie],
                None,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_eq!(
            header_str(&response, header::LOCATION),
            Some(format!("{}dashboard", test_origin()).as_str()),
            "to the frontend at the flow's return_to"
        );
        assert_eq!(
            header_str(&response, header::CACHE_CONTROL),
            Some("no-store")
        );
        assert_eq!(
            cookie_named(&response, flow_cookie_name()).map(|cookie| cookie.value().to_owned()),
            Some(String::new()),
            "the flow cookie is cleared"
        );
        let token = session_cookie_of(&response).expect("the browser is signed in");
        assert_eq!(provider.exchanged_code().as_deref(), Some("the-code"));

        // The account and the identity are there, and the session names them.
        let authenticated = crate::sessions::SessionService::new(pool.clone())
            .authenticate(&token)
            .await
            .unwrap()
            .expect("the session is live")
            .0;
        assert_eq!(authenticated.account.display_name.as_ref(), "Ada Lovelace");
        let identities = crate::identities::IdentityService::new(
            pool.clone(),
            Providers::empty(),
            crate::sessions::SessionService::new(pool.clone()),
            String::new(),
        )
        .list(authenticated.account.id)
        .await
        .unwrap();
        assert_eq!(identities.len(), 1);
        assert_eq!(identities[0].provider_subject, "42");
        assert_eq!(identities[0].profile, profile());
    }

    /// The session cookie a response set, as a token.
    fn session_cookie_of(response: &Response) -> Option<crate::sessions::SessionToken> {
        cookie_named(response, test_cookies().name())
            .and_then(|cookie| crate::sessions::SessionToken::parse(cookie.value()))
    }

    /// The link intent, end to end: the other acceptance criterion. No new
    /// session is issued — the browser already had one.
    #[sqlx::test]
    async fn linking_a_provider_attaches_it_to_the_sessions_account(pool: PgPool) {
        let provider = fake();
        let app = both_mounts(state_with(pool.clone(), &provider));
        let account = signed_in(&pool, "Ada").await;
        let before = sessions_of(&pool, account.account.id).await;

        let started = start(
            &app,
            "/api/identities/telegram/link-options",
            Some(&account.cookie),
            r#"{"returnTo":"/settings"}"#,
        )
        .await;
        let response = app
            .clone()
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                &[&started.cookie, &account.cookie],
                None,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_eq!(
            header_str(&response, header::LOCATION),
            Some(format!("{}settings", test_origin()).as_str())
        );
        assert_eq!(
            sessions_of(&pool, account.account.id).await,
            before,
            "linking issues no session"
        );
        assert_eq!(
            session_cookie(&response, test_cookies().name()),
            None,
            "no session cookie: nothing was issued and nothing was due for renewal"
        );
    }

    /// A link started under a session that is due for renewal: the start
    /// endpoint answers with the flow cookie *and* the renewed session
    /// cookie, and the callback keeps the renewal beside the flow-clearing
    /// cookie. Before the renewal layer keyed its suppression to the session
    /// cookie's name, the flow cookie silently swallowed both.
    #[sqlx::test]
    async fn a_renewal_rides_along_with_the_flow_cookie(pool: PgPool) {
        let app = both_mounts(state_with(pool.clone(), &fake()));
        let account = signed_in(&pool, "Ada").await;
        last_seen(&pool, account.session_id, "2 hours").await;

        let started = start(
            &app,
            "/api/identities/telegram/link-options",
            Some(&account.cookie),
            "{}",
        )
        .await;

        let renewed = cookie_named(&started.response, test_cookies().name())
            .expect("the renewal reaches the browser beside the flow cookie");
        assert_eq!(renewed.value(), account.token.expose(), "the same session");
        let max_age = renewed.max_age().expect("a renewal pushes Max-Age out");
        let idle = as_time(SESSION_IDLE_TIMEOUT);
        assert!(max_age <= idle && max_age > idle - time::Duration::seconds(5));
        assert!(cookie_named(&started.response, flow_cookie_name()).is_some());

        // And again on the callback, where the renewal must survive next to
        // the flow cookie being cleared.
        last_seen(&pool, account.session_id, "2 hours").await;
        let response = app
            .clone()
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                &[&started.cookie, &account.cookie],
                None,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_eq!(
            cookie_named(&response, test_cookies().name()).map(|cookie| cookie.value().to_owned()),
            Some(account.token.expose().to_owned()),
            "the renewal is on the callback's answer too"
        );
        assert_eq!(
            cookie_named(&response, flow_cookie_name()).map(|cookie| cookie.value().to_owned()),
            Some(String::new())
        );
    }

    /// Every way a `state` can fail to name a flow this request may finish.
    #[sqlx::test]
    async fn a_state_that_names_no_live_flow_is_refused_with_a_stable_code(pool: PgPool) {
        let providers = Providers::new([
            Arc::new(FakeProvider::new(SLUG).answering("42", profile())) as Arc<dyn Provider>,
            Arc::new(FakeProvider::new("github").answering("7", profile())) as Arc<dyn Provider>,
        ]);
        let app = both_mounts(test_state_with_providers(pool.clone(), providers));
        let path = "/api/identities/telegram/sign-in-options";

        // A state nobody minted.
        let foreign = start(&app, path, None, "{}").await;
        let response = app
            .clone()
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", Uuid::new_v4())),
                &[&foreign.cookie],
                None,
            ))
            .await
            .unwrap();
        assert_page(
            response,
            StatusCode::BAD_REQUEST,
            "flow_not_found",
            FlowCookie::Untouched,
        )
        .await;

        // A state that is not even a uuid, and one that is missing.
        for query in ["state=not-a-uuid&code=c", "code=c", ""] {
            let response = app
                .clone()
                .oneshot(request(
                    "GET",
                    &callback_uri(SLUG, query),
                    &[&foreign.cookie],
                    None,
                ))
                .await
                .unwrap();
            assert_page(
                response,
                StatusCode::BAD_REQUEST,
                "flow_not_found",
                FlowCookie::Untouched,
            )
            .await;
        }

        // A replayed callback: the second one finds nothing.
        let started = start(&app, path, None, "{}").await;
        let uri = callback_uri(SLUG, &format!("state={}&code=c", started.state));
        let first = app
            .clone()
            .oneshot(request("GET", &uri, &[&started.cookie], None))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::FOUND);
        let replay = app
            .clone()
            .oneshot(request("GET", &uri, &[&started.cookie], None))
            .await
            .unwrap();
        assert_page(
            replay,
            StatusCode::BAD_REQUEST,
            "flow_not_found",
            FlowCookie::Untouched,
        )
        .await;

        // An expired flow, by the database's clock.
        let expired = start(&app, path, None, "{}").await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE external_identity_flows SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", expired.state)),
                &[&expired.cookie],
                None,
            ))
            .await
            .unwrap();
        assert_page(
            response,
            StatusCode::BAD_REQUEST,
            "flow_not_found",
            FlowCookie::Untouched,
        )
        .await;

        // A state arriving on another provider's callback path.
        let other_path = start(&app, path, None, "{}").await;
        let response = app
            .oneshot(request(
                "GET",
                &callback_uri("github", &format!("state={}&code=c", other_path.state)),
                &[&other_path.cookie],
                None,
            ))
            .await
            .unwrap();
        assert_page(
            response,
            StatusCode::BAD_REQUEST,
            "flow_not_found",
            FlowCookie::Untouched,
        )
        .await;
    }

    /// The browser binding: a `state` minted for another browser, or for
    /// none, is refused however valid it is.
    #[sqlx::test]
    async fn a_callback_without_the_flow_cookie_is_a_foreign_flow(pool: PgPool) {
        let app = both_mounts(state_with(pool, &fake()));
        let path = "/api/identities/telegram/sign-in-options";
        let other = start(&app, path, None, "{}").await;

        for cookies in [vec![], vec![other.cookie.as_str()]] {
            let started = start(&app, path, None, "{}").await;

            let response = app
                .clone()
                .oneshot(request(
                    "GET",
                    &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                    &cookies,
                    None,
                ))
                .await
                .unwrap();

            assert_page(
                response,
                StatusCode::BAD_REQUEST,
                "foreign_flow",
                FlowCookie::Untouched,
            )
            .await;
        }
    }

    /// A browser's cookie jar: what the responses so far left behind, which is
    /// what the next request sends. The tests above resend a saved cookie
    /// string, which cannot notice a removal; this one has to.
    #[derive(Debug, Default)]
    struct Jar(std::collections::BTreeMap<String, String>);

    impl Jar {
        /// Applies a response's `Set-Cookie` headers, treating a cookie with
        /// an empty value as the removal it is.
        fn apply(&mut self, response: &Response) {
            for cookie in response
                .headers()
                .get_all(header::SET_COOKIE)
                .iter()
                .filter_map(|value| value.to_str().ok())
                .filter_map(|value| Cookie::parse(value.to_owned()).ok())
            {
                if cookie.value().is_empty() {
                    self.0.remove(cookie.name());
                } else {
                    self.0
                        .insert(cookie.name().to_owned(), cookie.value().to_owned());
                }
            }
        }

        fn header(&self) -> Vec<String> {
            self.0
                .iter()
                .map(|(name, value)| format!("{name}={value}"))
                .collect()
        }
    }

    /// A callback that consumes nothing must leave the browser's flow cookie
    /// where it is: that cookie belongs to whichever flow is current, and a
    /// navigation to this address from anywhere — another tab on an old
    /// callback, a link on someone else's page — would otherwise spend it and
    /// turn the live flow's own callback into a `foreign_flow`.
    #[sqlx::test]
    async fn a_callback_that_consumes_nothing_leaves_a_live_flow_alone(pool: PgPool) {
        let app = both_mounts(state_with(pool.clone(), &fake()));
        let live = start(&app, "/api/identities/telegram/sign-in-options", None, "{}").await;
        let mut jar = Jar::default();
        jar.apply(&live.response);
        assert!(
            jar.header()
                .iter()
                .any(|cookie| cookie.contains(flow_cookie_name())),
            "the premise: the browser is holding the live flow's cookie"
        );

        // The drive-by: a `state` nobody minted, carrying the cookie the
        // browser holds, and whatever it answers is applied to the jar.
        let drive_by = app
            .clone()
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", Uuid::new_v4())),
                &jar.header().iter().map(String::as_str).collect::<Vec<_>>(),
                None,
            ))
            .await
            .unwrap();
        jar.apply(&drive_by);
        assert_page(
            drive_by,
            StatusCode::BAD_REQUEST,
            "flow_not_found",
            FlowCookie::Untouched,
        )
        .await;

        // The live flow still finishes, with the jar as the browser now holds
        // it.
        let finished = app
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", live.state)),
                &jar.header().iter().map(String::as_str).collect::<Vec<_>>(),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(
            finished.status(),
            StatusCode::FOUND,
            "the flow the browser started is still its own"
        );
        assert!(
            session_cookie_of(&finished).is_some(),
            "and it signs in, rather than answering foreign_flow"
        );
    }

    /// A link may only finish under a session naming the account it was
    /// started for.
    #[sqlx::test]
    async fn a_link_callback_under_the_wrong_session_is_refused(pool: PgPool) {
        let app = both_mounts(state_with(pool.clone(), &fake()));
        let account = signed_in(&pool, "Ada").await;
        let (_, other) = register_soft_passkey(&pool).await;
        let other_session = crate::sessions::SessionService::new(pool.clone())
            .create(other.account.id, crate::sessions::SessionOrigin::Login)
            .await
            .unwrap();
        let other_cookie = format!("{}={}", test_cookies().name(), other_session.token.expose());

        for session in [None, Some(other_cookie.as_str())] {
            let started = start(
                &app,
                "/api/identities/telegram/link-options",
                Some(&account.cookie),
                "{}",
            )
            .await;
            let mut cookies = vec![started.cookie.as_str()];
            cookies.extend(session);

            let response = app
                .clone()
                .oneshot(request(
                    "GET",
                    &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                    &cookies,
                    None,
                ))
                .await
                .unwrap();

            assert_page(
                response,
                StatusCode::FORBIDDEN,
                "link_session_mismatch",
                FlowCookie::Cleared,
            )
            .await;
        }
    }

    /// An identity another account holds cannot be linked to this one.
    #[sqlx::test]
    async fn linking_an_identity_another_account_holds_is_a_conflict(pool: PgPool) {
        let app = both_mounts(state_with(pool.clone(), &fake()));
        let account = signed_in(&pool, "Ada").await;
        let (_, other) = register_soft_passkey(&pool).await;
        crate::testing::link_external_identity(&pool, other.account.id, "42").await;

        let started = start(
            &app,
            "/api/identities/telegram/link-options",
            Some(&account.cookie),
            "{}",
        )
        .await;
        let response = app
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                &[&started.cookie, &account.cookie],
                None,
            ))
            .await
            .unwrap();

        assert_page(
            response,
            StatusCode::CONFLICT,
            "identity_already_linked",
            FlowCookie::Cleared,
        )
        .await;
    }

    /// What the provider itself can go wrong with, each with its own code and
    /// its own status.
    #[sqlx::test]
    async fn a_provider_failure_answers_its_own_page(pool: PgPool) {
        let denied = fake();
        let app = both_mounts(state_with(pool.clone(), &denied));
        let started = start(&app, "/api/identities/telegram/sign-in-options", None, "{}").await;

        let response = app
            .oneshot(request(
                "GET",
                &callback_uri(
                    SLUG,
                    &format!("state={}&error=access_denied", started.state),
                ),
                &[&started.cookie],
                None,
            ))
            .await
            .unwrap();
        assert_page(
            response,
            StatusCode::BAD_REQUEST,
            "provider_denied",
            FlowCookie::Cleared,
        )
        .await;
        assert_eq!(denied.exchanges(), 0, "a refusal is not exchanged");

        for (provider, status, code) in [
            (
                Arc::new(FakeProvider::new(SLUG).rejecting()),
                StatusCode::BAD_REQUEST,
                "provider_exchange_failed",
            ),
            (
                Arc::new(FakeProvider::new(SLUG).unavailable()),
                StatusCode::SERVICE_UNAVAILABLE,
                "provider_unavailable",
            ),
        ] {
            let app = both_mounts(state_with(pool.clone(), &provider));
            let started = start(&app, "/api/identities/telegram/sign-in-options", None, "{}").await;

            let response = app
                .oneshot(request(
                    "GET",
                    &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                    &[&started.cookie],
                    None,
                ))
                .await
                .unwrap();

            assert_page(response, status, code, FlowCookie::Cleared).await;
        }
    }

    /// What the start endpoints refuse, in the `/api` error shape.
    #[sqlx::test]
    async fn the_start_endpoints_refuse_what_they_cannot_serve(pool: PgPool) {
        let app = both_mounts(state_with(pool.clone(), &fake()));
        let account = signed_in(&pool, "Ada").await;

        // A provider no deployment serves, for either intent.
        for (uri, cookie) in [
            ("/api/identities/github/sign-in-options", None),
            (
                "/api/identities/github/link-options",
                Some(account.cookie.as_str()),
            ),
        ] {
            let cookies: Vec<&str> = cookie.into_iter().collect();
            let response = app
                .clone()
                .oneshot(request("POST", uri, &cookies, Some("{}")))
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
            assert_eq!(
                body_json(response).await["error"]["code"],
                "unknown_provider"
            );
        }

        // A `returnTo` that could send the browser off-site.
        let response = app
            .clone()
            .oneshot(request(
                "POST",
                "/api/identities/telegram/sign-in-options",
                &[],
                Some(r#"{"returnTo":"//evil.example"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "invalid_return_to"
        );

        // Linking needs a session; signing in does not.
        let response = app
            .clone()
            .oneshot(request(
                "POST",
                "/api/identities/telegram/link-options",
                &[],
                Some("{}"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "unauthenticated"
        );

        // An upgrade session is no session here either (ADR 0015 (a)).
        let upgrade = crate::testing::upgrade_signed_in(&pool).await;
        let response = app
            .oneshot(request(
                "POST",
                "/api/identities/telegram/link-options",
                &[&upgrade.cookie],
                Some("{}"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    /// A body-less start works: `returnTo` is the only field and it is
    /// optional, so the default path is what the flow carries.
    #[sqlx::test]
    async fn an_empty_body_starts_a_flow_to_the_default_path(pool: PgPool) {
        let app = both_mounts(state_with(pool.clone(), &fake()));

        let started = start(&app, "/api/identities/telegram/sign-in-options", None, "{}").await;
        let response = app
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                &[&started.cookie],
                None,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FOUND);
        assert_eq!(
            header_str(&response, header::LOCATION),
            Some(test_origin().as_str())
        );
    }

    /// A `HEAD` must not consume a flow for a response nobody reads.
    #[sqlx::test]
    async fn head_on_the_callback_is_refused(pool: PgPool) {
        let app = both_mounts(state_with(pool.clone(), &fake()));
        let started = start(&app, "/api/identities/telegram/sign-in-options", None, "{}").await;

        let response = app
            .clone()
            .oneshot(request(
                "HEAD",
                &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                &[&started.cookie],
                None,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(header_str(&response, header::ALLOW), Some("GET"));
        // The flow is untouched: the `GET` still finishes it.
        let finished = app
            .oneshot(request(
                "GET",
                &callback_uri(SLUG, &format!("state={}&code=c", started.state)),
                &[&started.cookie],
                None,
            ))
            .await
            .unwrap();
        assert_eq!(finished.status(), StatusCode::FOUND);
    }

    /// Production registers no provider, so every start is `unknown_provider`
    /// until the first one ships (#754).
    #[sqlx::test]
    async fn a_deployment_without_providers_serves_none(pool: PgPool) {
        let app = both_mounts(test_state(pool));

        let response = app
            .oneshot(request(
                "POST",
                "/api/identities/telegram/sign-in-options",
                &[],
                Some("{}"),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            body_json(response).await["error"]["code"],
            "unknown_provider"
        );
    }
}
