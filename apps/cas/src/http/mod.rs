//! HTTP transport root: the router, the middleware stack and the error
//! contract the contexts are mapped onto. The handlers themselves live with
//! their context, in `<context>/http`; this module only mounts them.

pub mod error;
pub(crate) mod extract;
mod fetch_metadata;
mod health;
pub(crate) mod openapi;
pub mod response;

use axum::{
    Router,
    body::Body,
    http::{HeaderValue, Method, Request, header},
    response::{IntoResponse, Response},
};
use sqlx::postgres::PgPoolOptions;
use thiserror::Error;
use tower::Layer;
use tower_http::{
    catch_panic::CatchPanicLayer,
    cors::{AllowOrigin, CorsLayer},
    normalize_path::{NormalizePath, NormalizePathLayer},
    set_header::SetResponseHeaderLayer,
    trace::{self, TraceLayer},
};
use tracing::Level;
use url::Url;
use utoipa_axum::router::OpenApiRouter;

use crate::accounts::AccountManagement;
use crate::accounts::http as accounts_http;
use crate::config::Config;
use crate::http::error::ApiError;
use crate::http::fetch_metadata::AllowedOrigins;
use crate::oidc::http::{self as oidc_http, Documents};
use crate::oidc::{
    AuthorizationService, Discovery, EndSessionService, SigningKeyError, SigningKeys, TokenService,
    UpgradeHintService, UserInfoService,
};
use crate::sessions::SessionService;
use crate::sessions::http as sessions_http;
use crate::sessions::http::CookieSettings;
use crate::webauthn::addition::AdditionService;
use crate::webauthn::build_webauthn;
use crate::webauthn::http as webauthn_http;
use crate::webauthn::login::LoginService;
use crate::webauthn::management::PasskeyManagement;
use crate::webauthn::registration::RegistrationService;
use crate::webauthn::upgrade::UpgradeService;

/// Why the router could not be built. Everything here fails at startup, before
/// a single request is served.
#[derive(Debug, Error, miette::Diagnostic)]
pub enum AppError {
    #[error("Failed to configure WebAuthn: {0}")]
    #[diagnostic(code(cas::webauthn_init_error))]
    WebauthnInit(webauthn_rs::prelude::WebauthnError),

    #[error("Failed to create the database pool: {0}")]
    #[diagnostic(code(cas::db_pool_error))]
    DbPool(sqlx::Error),

    #[error("CAS_SIGNING_KEY is not set and a release build has no development default")]
    #[diagnostic(code(cas::signing_key_error))]
    MissingSigningKey,

    #[error("CAS_SIGNING_KEY: {0}")]
    #[diagnostic(code(cas::signing_key_error))]
    SigningKey(#[source] SigningKeyError),
}

/// The services the API handlers share.
#[derive(Clone)]
pub struct ApiState {
    pub registration: RegistrationService,
    pub login: LoginService,
    pub addition: AdditionService,
    /// The guest upgrade, run by the registration endpoints under an upgrade
    /// session (ADR 0015).
    pub upgrade: UpgradeService,
    pub passkeys: PasskeyManagement,
    pub accounts: AccountManagement,
    pub sessions: SessionService,
    pub cookies: CookieSettings,
    pub authorization: AuthorizationService,
    /// `/token`, signing with the active key as `CAS_ISSUER`.
    pub tokens: TokenService,
    /// `/userinfo`, verifying access tokens against every published key.
    pub userinfo: UserInfoService,
    /// `/end_session`, verifying logout hints against every published key.
    pub end_session: EndSessionService,
    /// `/authorize`, verifying a guest's `id_token_hint` against every
    /// published key (ADR 0015 (c)).
    pub upgrade_hints: UpgradeHintService,
    /// The frontend's origin (`CAS_ORIGIN`): where the sign-in screen is,
    /// for `/authorize` to send an anonymous request to.
    pub frontend_origin: Url,
}

/// The whole service: the routers behind their middleware, with trailing
/// slashes trimmed before routing. `NormalizePath` wraps the `Router` from
/// the outside rather than through `Router::layer`, because routing has
/// already happened by the time a `Router::layer` middleware runs; from the
/// outside, `/api/` becomes `/api` and lands on the `/api` router's own
/// fallback, behind its layers, instead of falling through to the outer
/// router (a nested router's catch-all does not match an empty rest, so the
/// slash-terminated prefix alone escaped it). `/api/me/` is `/api/me`, and
/// nothing served here gives a trailing slash a meaning of its own.
///
/// Every router is an `OpenApiRouter`, so the document `GET /openapi.json`
/// serves is collected from the same mounts that route the requests
/// (`openapi`). In tests, every answer is also checked against it.
pub fn app(config: Config) -> Result<NormalizePath<Router>, AppError> {
    // Lazy pool: connections open on first use, so startup succeeds even when
    // the DB is down and `/health` reports the actual connectivity.
    let pool = PgPoolOptions::new()
        .acquire_timeout(health::DB_TIMEOUT)
        .connect_lazy(&config.database_url)
        .map_err(AppError::DbPool)?;

    let webauthn = build_webauthn(&config.rp_id, &config.origin).map_err(AppError::WebauthnInit)?;

    // Only the server signs, so only the server refuses to start without a
    // key; the tools that share `Config` do not need one.
    let pem = config
        .signing_key
        .as_ref()
        .ok_or(AppError::MissingSigningKey)?;
    let signing_keys = SigningKeys::from_pem(pem.expose()).map_err(AppError::SigningKey)?;
    // The kid is public; this line is what an operator checks after a
    // rotation.
    tracing::info!(
        kid = signing_keys.active().kid(),
        published = signing_keys.published().len(),
        "signing key loaded"
    );
    let documents = Documents {
        discovery: Discovery::for_issuer(&config.issuer),
        jwks: signing_keys.jwks(),
    };
    let verifying_keys = signing_keys.verifying_keys();

    let api_state = ApiState {
        registration: RegistrationService::new(webauthn.clone(), pool.clone()),
        login: LoginService::new(webauthn.clone(), pool.clone()),
        addition: AdditionService::new(webauthn.clone(), pool.clone()),
        upgrade: UpgradeService::new(webauthn, pool.clone()),
        passkeys: PasskeyManagement::new(pool.clone()),
        accounts: AccountManagement::new(pool.clone()),
        sessions: SessionService::new(pool.clone()),
        cookies: CookieSettings::for_origin(&config.origin),
        authorization: AuthorizationService::new(pool.clone()),
        tokens: TokenService::new(
            pool.clone(),
            signing_keys.active().clone(),
            config.issuer.clone(),
        ),
        userinfo: UserInfoService::new(pool.clone(), verifying_keys.clone(), config.issuer.clone()),
        end_session: EndSessionService::new(
            AuthorizationService::new(pool.clone()),
            verifying_keys.clone(),
            config.issuer.clone(),
        ),
        upgrade_hints: UpgradeHintService::new(pool.clone(), verifying_keys, config.issuer.clone()),
        frontend_origin: config.origin.clone(),
    };

    let (userinfo, userinfo_document) =
        oidc_http::userinfo_router(api_state.clone()).split_for_parts();
    let (router, mut document) = OpenApiRouter::with_openapi(openapi::base())
        .merge(health::router(pool))
        .merge(oidc_http::router(documents))
        .merge(oidc_http::authorize_router(api_state.clone()))
        .merge(oidc_http::token_router(api_state.clone()))
        .merge(oidc_http::end_session_router(api_state.clone()))
        .nest(
            "/api",
            api_router(api_state, AllowedOrigins::new(config.cors_origins.clone())),
        )
        .split_for_parts();
    document.merge(userinfo_document);
    let (router, _document) = openapi::serve_document(router, document);

    let service = with_middleware(router, userinfo, config.cors_origins);
    #[cfg(test)]
    let service = openapi::conformance::check(service, &_document);

    Ok(NormalizePathLayer::trim_trailing_slash().layer(service))
}

/// Everything under `/api`: the contexts' routers, re-sending the session
/// cookie when a request renewed its session (ADR 0004), behind the CSRF
/// line (ADR 0005), every answer marked uncacheable (ADR 0004 (i)).
/// `/health` stays outside all of it: it is read-only and probed by machines
/// that send no browser headers, and nothing it says is bound to a session.
///
/// `no-store` is a layer on the router rather than a header each handler
/// sets, because it has to hold for every answer under `/api` — an account,
/// a ceremony challenge, a validation error, a 403 from the CSRF line, a
/// path that does not exist — and a new endpoint must be covered by where it
/// is mounted. It wraps the CSRF line from the outside so that the layer's
/// own refusals carry it too.
///
/// The description is taken off the contexts' routers before the CSRF line
/// wraps them, completed with the line's own refusal, and handed back with
/// the guarded router for the root to nest.
fn api_router(state: ApiState, origins: AllowedOrigins) -> OpenApiRouter {
    // `/me` is one path with two owners by verb: the sessions router answers
    // `GET`, the accounts router `PATCH`, and axum merges the two method
    // routers for the path (ADR 0007).
    let api = OpenApiRouter::new()
        .nest("/webauthn", webauthn_http::router(state.clone()))
        .nest("/passkeys", webauthn_http::passkeys::router(state.clone()))
        .merge(sessions_http::router(state.clone()))
        .merge(accounts_http::router(state))
        .fallback(not_found);

    let (api, mut document) = sessions_http::with_cookie_renewal(api).split_for_parts();
    fetch_metadata::describe(&mut document);
    let guarded = fetch_metadata::guard(api, origins).layer(SetResponseHeaderLayer::overriding(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store"),
    ));

    let mut api = OpenApiRouter::from(guarded);
    *api.get_openapi_mut() = document;
    api
}

/// The answer for a path under `/api` that does not exist.
///
/// It is here so that the `/api` router owns a fallback at all: `Router::layer`
/// wraps a router's routes and its fallback, but a nested router without one
/// leaves unmatched paths to the outer router, where neither the CSRF line nor
/// `no-store` can see them. With this, "everything under `/api`" means every
/// path under `/api` and not merely every registered one, and an unknown path
/// answers in the same `ApiError` shape as the rest of the API instead of a
/// bare framework 404.
async fn not_found() -> ApiError {
    ApiError::not_found("not_found", "Not found")
}

/// Applies the middleware stack to the two routers the service is made of:
/// `router`, everything under the root CORS policy, and `userinfo`, which
/// has a policy of its own (ADR 0013 (e)). Must be called after all routes
/// are registered: `Router::layer` only wraps already-registered routes.
///
/// Each router gets its CORS layer outside its own `CatchPanicLayer`, so a
/// panic response still carries that router's CORS headers, and the trace
/// layer wraps both: trace, then CORS, then catch-panic, from the outside
/// in. The CORS layers cannot share a stack: a CORS layer answers every
/// preflight that reaches it itself, so a route-level policy under the root
/// one would never see its own preflights.
///
/// `userinfo` is merged first. Neither router sets a fallback, and when
/// neither does, axum keeps the fallback of the router merged last: the
/// root router's, behind the root CORS and panic layers, which is where
/// every unknown path has always been answered.
///
/// The root router's session cookie travels cross-origin from the
/// frontend, which needs `Access-Control-Allow-Credentials`; browsers refuse
/// that next to a wildcard, so methods and headers are listed rather than
/// `Any`.
///
/// The request trace logs the method, the path, the status and the latency,
/// and no headers in either direction: registration and login answer with
/// `Set-Cookie` carrying the session token, and the whole point of the token
/// living only in the cookie is that it appears in no log (ADR 0004). The
/// same goes the other way, where the `Cookie` header would arrive with
/// every authenticated request. Nor does it log the query: a `GET
/// /end_session` carries a signed ID token there, with the account's name
/// and address in it (ADR 0013), so the span records the path alone.
fn with_middleware(router: Router, userinfo: Router, cors_origins: Vec<HeaderValue>) -> Router {
    let cors_layer = CorsLayer::new()
        .allow_origin(AllowOrigin::list(cors_origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE])
        .allow_credentials(true);

    let router = router
        .layer(CatchPanicLayer::custom(handle_panic))
        .layer(cors_layer);
    let userinfo = userinfo
        .layer(CatchPanicLayer::custom(handle_panic))
        .layer(oidc_http::userinfo_cors());

    userinfo.merge(router).layer(
        TraceLayer::new_for_http()
            .make_span_with(request_span)
            .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
    )
}

/// The span every line of a request is logged in: what `DefaultMakeSpan`
/// records, at its level, with the path in place of the whole URI. The
/// query is left out because it can carry a token (see `with_middleware`).
fn request_span(request: &Request<Body>) -> tracing::Span {
    tracing::debug_span!(
        "request",
        method = %request.method(),
        path = %request.uri().path(),
        version = ?request.version(),
    )
}

/// Turns an unexpected handler panic into the standard `ApiError` 500
/// response instead of an aborted connection.
fn handle_panic(panic: Box<dyn std::any::Any + Send + 'static>) -> Response {
    let message = panic
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| panic.downcast_ref::<&str>().copied())
        .unwrap_or("unknown panic payload");
    tracing::error!(panic = message, "request handler panicked");
    ApiError::internal(format!("panic: {message}")).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
        routing::get,
    };
    use sqlx::PgPool;
    use tower::ServiceExt;

    use crate::accounts::{AccountRepository, NewAccount};
    use crate::config::SigningKeyPem;
    use crate::oidc::{SigningKey, SigningKeys};
    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{
        DEV_SIGNING_KEY_KID, capture_tracing, checked, display_name, fresh_signing_key_pem,
        header_str, register_public_client, session_cookie, signed_id_token,
        soft_passkey_registration, test_config, test_cookies, test_signing_key, test_state,
    };

    const ALLOWED_ORIGIN: &str = "http://localhost:5173";
    const OTHER_ORIGIN: &str = "https://evil.example";

    /// A key the server cannot use is a startup error that names the
    /// variable and quotes nothing of its value.
    #[tokio::test]
    async fn an_invalid_signing_key_fails_startup_without_echoing_it() {
        let mut config = test_config();
        config.signing_key = Some(SigningKeyPem::new("not a key"));

        let error = app(config).unwrap_err();

        assert!(matches!(error, AppError::SigningKey(_)), "{error:?}");
        let message = error.to_string();
        assert!(message.starts_with("CAS_SIGNING_KEY:"), "{message}");
        assert!(!message.contains("not a key"), "{message}");
    }

    /// What a release build without `CAS_SIGNING_KEY` meets.
    #[tokio::test]
    async fn a_missing_signing_key_fails_startup() {
        let mut config = test_config();
        config.signing_key = None;

        assert!(matches!(
            app(config).unwrap_err(),
            AppError::MissingSigningKey
        ));
    }

    #[tokio::test]
    async fn startup_logs_the_active_kid() {
        let (events, _guard) = capture_tracing();

        app(test_config()).unwrap();

        let loaded = events.mentioning("signing key loaded");
        assert_eq!(loaded.len(), 1, "{:?}", events.all());
        assert!(loaded[0].contains(DEV_SIGNING_KEY_KID), "{loaded:?}");
    }

    #[tokio::test]
    async fn cors_preflight_from_allowed_origin_succeeds() {
        let request = Request::builder()
            .method("OPTIONS")
            .uri("/api/webauthn/register-options")
            .header(header::ORIGIN, ALLOWED_ORIGIN)
            .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
            .body(Body::empty())
            .unwrap();

        let response = app(test_config()).unwrap().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .expect("preflight response must carry allow-origin"),
            ALLOWED_ORIGIN
        );
        assert!(
            response
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_METHODS)
        );
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
                .expect("the session cookie needs credentials to be allowed"),
            "true"
        );
    }

    /// The sessions and accounts routers are merged at `/api`, the webauthn
    /// and passkeys ones nested inside that prefix; a request must reach the
    /// right one. All requests fail before any query, so no database is
    /// needed.
    #[tokio::test]
    async fn every_context_is_reachable_under_the_api_prefix() {
        let app = app(test_config()).unwrap();

        for (method, uri) in [
            ("GET", "/api/me"),
            ("PATCH", "/api/me"),
            ("GET", "/api/passkeys"),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(uri)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                StatusCode::UNAUTHORIZED,
                "{method} {uri}"
            );
        }

        let login = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/webauthn/verify-login")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"loginId":"not-a-uuid","response":{}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    fn allowed_origins() -> AllowedOrigins {
        AllowedOrigins::new(vec![HeaderValue::from_static(ALLOWED_ORIGIN)])
    }

    async fn signed_in(pool: &PgPool) -> String {
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let issued = SessionService::new(pool.clone())
            .create(account.id, SessionOrigin::Login)
            .await
            .unwrap();
        format!("{}={}", test_cookies().name(), issued.token.expose())
    }

    /// The gap ADR 0004 left open: a cross-site HTML form posting to the
    /// body-less logout with the victim's cookie. The layer refuses it and
    /// the session is still there.
    #[sqlx::test]
    async fn a_cross_site_form_post_to_logout_is_forbidden_and_keeps_the_session(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let app = checked(api_router(test_state(pool), allowed_origins()));

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/logout")
                    .header("sec-fetch-site", "cross-site")
                    .header("sec-fetch-mode", "navigate")
                    .header(header::ORIGIN, OTHER_ORIGIN)
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(
            !response.headers().contains_key(header::SET_COOKIE),
            "a refused request must not touch the cookie"
        );
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["error"]["code"], "cross_site_request");

        let me = app
            .oneshot(
                Request::builder()
                    .uri("/me")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(me.status(), StatusCode::OK, "the session must survive");
    }

    /// The frontend's own `fetch` with credentials reaches the handler.
    #[sqlx::test]
    async fn a_fetch_from_the_frontend_logs_out(pool: PgPool) {
        let cookie = signed_in(&pool).await;

        let response = checked(api_router(test_state(pool), allowed_origins()))
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/logout")
                    .header("sec-fetch-site", "cross-site")
                    .header("sec-fetch-mode", "cors")
                    .header(header::ORIGIN, ALLOWED_ORIGIN)
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    /// Every context's router sits behind the layer, and a `GET` is not its
    /// business: `/api/me` from another site answers 401 for the missing
    /// session, not 403.
    #[tokio::test]
    async fn every_api_route_is_behind_the_csrf_line_but_gets_pass() {
        let app = app(test_config()).unwrap();
        let cross_site = |method: &str, uri: &str| {
            Request::builder()
                .method(method)
                .uri(uri)
                .header("sec-fetch-site", "cross-site")
                .header(header::ORIGIN, OTHER_ORIGIN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from("{}"))
                .unwrap()
        };

        for (method, uri) in [
            ("POST", "/api/logout"),
            ("POST", "/api/webauthn/verify-login"),
            ("POST", "/api/passkeys/register-options"),
            ("PATCH", "/api/me"),
        ] {
            let response = app.clone().oneshot(cross_site(method, uri)).await.unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{method} {uri}");
        }

        let me = app
            .oneshot(
                Request::builder()
                    .uri("/api/me")
                    .header("sec-fetch-site", "cross-site")
                    .header(header::ORIGIN, OTHER_ORIGIN)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(me.status(), StatusCode::UNAUTHORIZED);
    }

    /// The session cookie must not leave the service through the request
    /// trace either. Registration answers with `Set-Cookie` and the raw
    /// token in it, so a trace that logged response headers wholesale would
    /// write the secret to the log that ADR 0004 keeps it out of. The
    /// ceremony runs through the real middleware stack and the real route.
    #[sqlx::test]
    async fn the_request_trace_does_not_log_the_session_cookie(pool: PgPool) {
        let (events, _guard) = capture_tracing();
        let app = with_middleware(
            checked(api_router(test_state(pool), allowed_origins())),
            Router::new(),
            vec![HeaderValue::from_static(ALLOWED_ORIGIN)],
        );
        let post = |uri: &str, body: serde_json::Value| {
            Request::builder()
                .method("POST")
                .uri(uri)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string()))
                .unwrap()
        };
        async fn body_json(response: axum::response::Response) -> serde_json::Value {
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            serde_json::from_slice(&bytes).unwrap()
        }

        let started = body_json(
            app.clone()
                .oneshot(post(
                    "/webauthn/register-options",
                    serde_json::json!({ "displayName": "Ada" }),
                ))
                .await
                .unwrap(),
        )
        .await;
        let attestation = soft_passkey_registration(
            serde_json::from_value(started["ccr"].clone()).expect("a challenge"),
        );
        let response = app
            .oneshot(post(
                "/webauthn/verify-registration",
                serde_json::json!({
                    "registrationId": started["registrationId"],
                    "response": attestation,
                }),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let token = session_cookie(&response, test_cookies().name())
            .expect("registration signs the account in");
        // The trace layer did run and was captured, so the absence below is
        // a statement about what it logs, not about an empty capture.
        assert!(events.contains("tower_http::trace"), "{:?}", events.all());
        assert!(events.contains("session created"), "{:?}", events.all());
        for event in events.all() {
            assert!(
                !event.contains(token.expose()),
                "the session token must never be logged: {event}"
            );
        }
    }

    /// The other direction: an authenticated request carries the token in
    /// `Cookie`, and the trace layer's request span is what a formatter
    /// prints next to every event of that request. Neither the span nor any
    /// event may hold the header. The capture records span fields, so a
    /// `DefaultMakeSpan` that included headers would fail here.
    #[sqlx::test]
    async fn the_request_trace_does_not_log_the_cookie_header(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let (events, _guard) = capture_tracing();
        let app = with_middleware(
            checked(api_router(test_state(pool), allowed_origins())),
            Router::new(),
            vec![HeaderValue::from_static(ALLOWED_ORIGIN)],
        );

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/me")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let token = cookie.split_once('=').expect("name=value").1;
        // The request span was created and captured, with the URI in it, so
        // the absence below is a statement about what the span carries.
        let spans = events.mentioning("SPAN");
        assert!(
            spans
                .iter()
                .any(|span| span.contains("request") && span.contains("/me")),
            "{spans:?}"
        );
        for event in events.all() {
            assert!(
                !event.contains(token),
                "the session token must never be logged, in a span or an event: {event}"
            );
        }
    }

    #[tokio::test]
    async fn panicking_handler_returns_api_error_json() {
        async fn panicking() -> &'static str {
            panic!("boom")
        }

        let app = with_middleware(
            Router::new().route("/panic", get(panicking)),
            Router::new(),
            vec![HeaderValue::from_static(ALLOWED_ORIGIN)],
        );

        let request = Request::builder()
            .uri("/panic")
            .header(header::ORIGIN, ALLOWED_ORIGIN)
            .body(Body::empty())
            .unwrap();
        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        // The CORS layer sits outside the panic handler, so the frontend can
        // read the error.
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .expect("a panic answer still carries CORS"),
            ALLOWED_ORIGIN
        );
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["error"]["code"], "internal_error");
        assert_eq!(body["error"]["message"], "Internal server error");
    }

    fn cache_control(response: &Response) -> Option<&str> {
        response
            .headers()
            .get(header::CACHE_CONTROL)
            .map(|value| value.to_str().unwrap())
    }

    /// Nothing under `/api` is cacheable, whatever it answers: the 401 for a
    /// missing session and a 422 for a malformed ceremony body are marked
    /// just as a successful answer is. Both requests fail before any query,
    /// so no database is needed.
    #[tokio::test]
    async fn every_api_answer_is_no_store_including_the_error_ones() {
        let app = app(test_config()).unwrap();

        let me = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/me")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(me.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(cache_control(&me), Some("no-store"));

        let login = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/webauthn/verify-login")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"loginId":"not-a-uuid","response":{}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(cache_control(&login), Some("no-store"));
    }

    /// A cross-site refusal is a response like any other and must not be
    /// cached either, which is why the layer wraps the CSRF line.
    #[tokio::test]
    async fn a_cross_site_refusal_is_no_store_too() {
        let response = app(test_config())
            .unwrap()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/logout")
                    .header("sec-fetch-site", "cross-site")
                    .header(header::ORIGIN, OTHER_ORIGIN)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(cache_control(&response), Some("no-store"));
    }

    /// The layer is on `/api` alone. `/health` says nothing about a session
    /// and is left to whatever caches its probes, and a path outside `/api`
    /// is still the outer router's plain 404.
    #[tokio::test]
    async fn nothing_outside_api_is_marked_no_store() {
        let app = app(test_config()).unwrap();

        for uri in ["/health", "/nowhere"] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();

            assert_eq!(cache_control(&response), None, "{uri}");
        }
    }

    /// The answer that actually carries session-bound data: a 200 `/api/me`
    /// for a live session must not be cached by a shared cache or replayed
    /// by the back button.
    #[sqlx::test]
    async fn a_successful_me_is_no_store(pool: PgPool) {
        let cookie = signed_in(&pool).await;

        let response = checked(api_router(test_state(pool), allowed_origins()))
            .oneshot(
                Request::builder()
                    .uri("/me")
                    .header(header::COOKIE, &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(cache_control(&response), Some("no-store"));
    }

    /// The `/api` router answers for its own unknown paths, so they are
    /// covered by its layers and answer in the shape the rest of the API
    /// uses. The webauthn prefix is nested inside the nested `/api`, and an
    /// unknown path under it lands on the same fallback.
    #[tokio::test]
    async fn an_unknown_api_path_is_a_not_found_in_the_error_shape() {
        let app = app(test_config()).unwrap();

        for uri in ["/api/nowhere", "/api/webauthn/nowhere"] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
            assert_eq!(cache_control(&response), Some("no-store"), "{uri}");
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["error"]["code"], "not_found", "{uri}");
        }
    }

    /// A trailing slash is trimmed before routing: `/api/` is the `/api`
    /// router's own 404 behind its layers, not the outer router's, and
    /// `/api/me/` reaches `/api/me`. Without the normalization, `/api/` alone
    /// escaped the nested router, since its catch-all does not match an
    /// empty rest.
    #[tokio::test]
    async fn a_trailing_slash_names_the_same_route() {
        let app = app(test_config()).unwrap();

        for uri in ["/api", "/api/"] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
            assert_eq!(cache_control(&response), Some("no-store"), "{uri}");
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["error"]["code"], "not_found", "{uri}");
        }

        let me = app
            .oneshot(
                Request::builder()
                    .uri("/api/me/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            me.status(),
            StatusCode::UNAUTHORIZED,
            "the route itself, not a 404"
        );
    }

    /// What the fallback is really for: a cross-site probe of a path that
    /// does not exist is turned away by the CSRF line as a registered route
    /// would be. Without a fallback of its own the `/api` router would hand
    /// the request to the outer router's 404, outside the layer.
    #[tokio::test]
    async fn a_cross_site_probe_of_an_unknown_api_path_is_forbidden() {
        let app = app(test_config()).unwrap();

        for uri in ["/api/", "/api/nowhere", "/api/webauthn/nowhere"] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(uri)
                        .header("sec-fetch-site", "cross-site")
                        .header(header::ORIGIN, OTHER_ORIGIN)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{uri}");
            assert_eq!(cache_control(&response), Some("no-store"), "{uri}");
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(body["error"]["code"], "cross_site_request", "{uri}");
        }
    }

    /// A preflight from `origin` for `method` on `uri`, with the
    /// `Authorization` header a browser would announce for a bearer call.
    async fn preflight(uri: &str, origin: &str, method: &str) -> Response {
        app(test_config())
            .unwrap()
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri(uri)
                    .header(header::ORIGIN, origin)
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, method)
                    .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    /// `/userinfo` is open to any origin, without credentials, for the
    /// `Authorization` header (ADR 0013 (e)).
    #[tokio::test]
    async fn userinfo_is_open_to_any_origin_without_credentials() {
        for method in ["GET", "POST"] {
            let response = preflight("/userinfo", OTHER_ORIGIN, method).await;

            assert_eq!(response.status(), StatusCode::OK, "{method}");
            assert_eq!(
                header_str(&response, header::ACCESS_CONTROL_ALLOW_ORIGIN),
                Some("*"),
                "{method}"
            );
            let headers = header_str(&response, header::ACCESS_CONTROL_ALLOW_HEADERS)
                .unwrap()
                .to_ascii_lowercase();
            assert!(headers.contains("authorization"), "{headers}");
            assert!(
                !response
                    .headers()
                    .contains_key(header::ACCESS_CONTROL_ALLOW_CREDENTIALS),
                "{method}"
            );
        }

        // The actual request too: no credentials, whatever the origin.
        let response = app(test_config())
            .unwrap()
            .oneshot(
                Request::builder()
                    .uri("/userinfo")
                    .header(header::ORIGIN, ALLOWED_ORIGIN)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            header_str(&response, header::ACCESS_CONTROL_ALLOW_ORIGIN),
            Some("*")
        );
        assert!(
            !response
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
        );
    }

    /// Everything else keeps the root policy: another origin is refused for
    /// the API and for `/token`, which stays backend-to-backend, and an
    /// unknown path is still answered behind the root policy.
    #[tokio::test]
    async fn only_userinfo_is_open_to_other_origins() {
        for uri in ["/api/me", "/token", "/end_session", "/nowhere"] {
            let response = preflight(uri, OTHER_ORIGIN, "POST").await;
            assert_eq!(
                header_str(&response, header::ACCESS_CONTROL_ALLOW_ORIGIN),
                None,
                "{uri}"
            );
        }

        let unknown = preflight("/nowhere", ALLOWED_ORIGIN, "POST").await;
        assert_eq!(
            header_str(&unknown, header::ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(ALLOWED_ORIGIN)
        );
        assert_eq!(
            header_str(&unknown, header::ACCESS_CONTROL_ALLOW_CREDENTIALS),
            Some("true")
        );
    }

    /// Both endpoints are mounted at the root and answer before any query:
    /// `/userinfo` without a token, `/end_session` without parameters.
    #[tokio::test]
    async fn userinfo_and_end_session_are_mounted_at_the_root() {
        let app = app(test_config()).unwrap();

        let userinfo = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/userinfo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(userinfo.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            header_str(&userinfo, header::WWW_AUTHENTICATE),
            Some("Bearer")
        );

        let end_session = app
            .oneshot(
                Request::builder()
                    .uri("/end_session")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(end_session.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            header_str(&end_session, header::CONTENT_TYPE),
            Some("text/html; charset=utf-8")
        );
    }

    /// A `GET /end_session` carries a signed ID token — the account's name
    /// and address inside — in its query. The request span records the
    /// path alone, so neither the hint, nor any of its segments, nor the
    /// `state` reaches a span or an event, whether the request is accepted
    /// or refused.
    #[sqlx::test]
    async fn the_request_trace_does_not_log_the_query(pool: PgPool) {
        let client = register_public_client(&pool, "ligretto-web", &[]).await;
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();
        let hint = |key: &SigningKey| {
            signed_id_token(
                key,
                &client,
                &account,
                &["openid"],
                time::OffsetDateTime::now_utc(),
            )
        };
        let accepted = hint(&test_signing_key());
        let refused = hint(
            SigningKeys::from_pem(&fresh_signing_key_pem())
                .unwrap()
                .active(),
        );
        let state = test_state(pool);
        let app = with_middleware(
            checked(oidc_http::end_session_router(state.clone())),
            checked(oidc_http::userinfo_router(state)),
            vec![HeaderValue::from_static(ALLOWED_ORIGIN)],
        );
        let (events, _guard) = capture_tracing();

        for (hint, status) in [
            (&accepted, StatusCode::FOUND),
            (&refused, StatusCode::BAD_REQUEST),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!(
                            "/end_session?id_token_hint={hint}&state=s3cr3t-state"
                        ))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), status);
        }

        let spans = events.mentioning("SPAN");
        assert!(
            spans
                .iter()
                .any(|span| span.contains("request") && span.contains("/end_session")),
            "{spans:?}"
        );
        for event in events.all() {
            assert!(
                !event.contains("s3cr3t-state"),
                "the query was logged: {event}"
            );
            assert!(!event.contains("ada@example.com"), "{event}");
            for hint in [&accepted, &refused] {
                for segment in hint.split('.') {
                    assert!(!event.contains(segment), "the hint was logged: {event}");
                }
            }
        }
    }
}
