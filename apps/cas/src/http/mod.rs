//! HTTP transport root: the router, the middleware stack and the error
//! contract the contexts are mapped onto. The handlers themselves live with
//! their context, in `<context>/http`; this module only mounts them.

pub mod error;
pub(crate) mod extract;
mod fetch_metadata;
mod health;

use axum::{
    Router,
    http::{HeaderValue, Method, header},
    response::{IntoResponse, Response},
};
use sqlx::postgres::PgPoolOptions;
use thiserror::Error;
use tower::Layer;
use tower::ServiceBuilder;
use tower_http::{
    catch_panic::CatchPanicLayer,
    cors::{AllowOrigin, CorsLayer},
    normalize_path::{NormalizePath, NormalizePathLayer},
    set_header::SetResponseHeaderLayer,
    trace::{self, TraceLayer},
};
use tracing::Level;

use crate::config::Config;
use crate::http::error::ApiError;
use crate::http::fetch_metadata::AllowedOrigins;
use crate::sessions::SessionService;
use crate::sessions::http as sessions_http;
use crate::sessions::http::CookieSettings;
use crate::webauthn::build_webauthn;
use crate::webauthn::http as webauthn_http;
use crate::webauthn::login::LoginService;
use crate::webauthn::management::PasskeyManagement;
use crate::webauthn::registration::RegistrationService;

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
}

/// The services the API handlers share.
#[derive(Clone)]
pub struct ApiState {
    pub registration: RegistrationService,
    pub login: LoginService,
    pub passkeys: PasskeyManagement,
    pub sessions: SessionService,
    pub cookies: CookieSettings,
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
pub fn app(config: Config) -> Result<NormalizePath<Router>, AppError> {
    // Lazy pool: connections open on first use, so startup succeeds even when
    // the DB is down and `/health` reports the actual connectivity.
    let pool = PgPoolOptions::new()
        .acquire_timeout(health::DB_TIMEOUT)
        .connect_lazy(&config.database_url)
        .map_err(AppError::DbPool)?;

    let webauthn = build_webauthn(&config.rp_id, &config.origin).map_err(AppError::WebauthnInit)?;

    let api_state = ApiState {
        registration: RegistrationService::new(webauthn.clone(), pool.clone()),
        login: LoginService::new(webauthn, pool.clone()),
        passkeys: PasskeyManagement::new(pool.clone()),
        sessions: SessionService::new(pool.clone()),
        cookies: CookieSettings::for_origin(&config.origin),
    };

    let router = Router::new().merge(health::router(pool)).nest(
        "/api",
        api_router(api_state, AllowedOrigins::new(config.cors_origins.clone())),
    );

    Ok(NormalizePathLayer::trim_trailing_slash()
        .layer(with_middleware(router, config.cors_origins)))
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
fn api_router(state: ApiState, origins: AllowedOrigins) -> Router {
    let api = Router::new()
        .nest("/webauthn", webauthn_http::router(state.clone()))
        .nest("/passkeys", webauthn_http::passkeys::router(state.clone()))
        .merge(sessions_http::router(state))
        .fallback(not_found);

    fetch_metadata::guard(sessions_http::with_cookie_renewal(api), origins).layer(
        SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ),
    )
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

/// Applies the middleware stack. Must be called after all routes are
/// registered: `Router::layer` only wraps already-registered routes.
///
/// `CatchPanicLayer` sits innermost so a panic response still passes through
/// the CORS and trace layers on the way out.
///
/// The session cookie travels cross-origin from the frontend, which needs
/// `Access-Control-Allow-Credentials`; browsers refuse that next to a
/// wildcard, so methods and headers are listed rather than `Any`.
///
/// The request trace logs the method, the path, the status and the latency,
/// and no headers in either direction: registration and login answer with
/// `Set-Cookie` carrying the session token, and the whole point of the token
/// living only in the cookie is that it appears in no log (ADR 0004). The
/// same goes the other way, where the `Cookie` header would arrive with
/// every authenticated request.
fn with_middleware(router: Router, cors_origins: Vec<HeaderValue>) -> Router {
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

    router.layer(
        ServiceBuilder::new()
            .layer(
                TraceLayer::new_for_http()
                    .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
            )
            .layer(cors_layer)
            .layer(CatchPanicLayer::custom(handle_panic)),
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
    use crate::sessions::http::cookie::SESSION_COOKIE;
    use crate::sessions::{SessionOrigin, SessionService};
    use crate::testing::{
        capture_tracing, display_name, session_cookie, soft_passkey_registration, test_state,
    };

    const ALLOWED_ORIGIN: &str = "http://localhost:5173";
    const OTHER_ORIGIN: &str = "https://evil.example";

    fn test_config() -> Config {
        Config {
            port: 0,
            rp_id: "localhost".to_string(),
            origin: ALLOWED_ORIGIN.parse().unwrap(),
            cors_origins: vec![HeaderValue::from_static(ALLOWED_ORIGIN)],
            database_url: "postgres://cas:cas@localhost:5434/cas".to_string(),
        }
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

    /// The sessions router is nested at `/api`, the webauthn and passkeys
    /// ones inside that prefix; a request must reach the right one. All
    /// requests fail before any query, so no database is needed.
    #[tokio::test]
    async fn both_contexts_are_reachable_under_the_api_prefix() {
        let app = app(test_config()).unwrap();

        for uri in ["/api/me", "/api/passkeys"] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{uri}");
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
        format!("{SESSION_COOKIE}={}", issued.token.expose())
    }

    /// The gap ADR 0004 left open: a cross-site HTML form posting to the
    /// body-less logout with the victim's cookie. The layer refuses it and
    /// the session is still there.
    #[sqlx::test]
    async fn a_cross_site_form_post_to_logout_is_forbidden_and_keeps_the_session(pool: PgPool) {
        let cookie = signed_in(&pool).await;
        let app = api_router(test_state(pool), allowed_origins());

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

        let response = api_router(test_state(pool), allowed_origins())
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

    /// Both nested routers sit behind the layer, and a `GET` is not its
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

        for uri in ["/api/logout", "/api/webauthn/verify-login"] {
            let response = app.clone().oneshot(cross_site("POST", uri)).await.unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{uri}");
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
            api_router(test_state(pool), allowed_origins()),
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
        let token = session_cookie(&response).expect("registration signs the account in");
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

    #[tokio::test]
    async fn panicking_handler_returns_api_error_json() {
        async fn panicking() -> &'static str {
            panic!("boom")
        }

        let app = with_middleware(
            Router::new().route("/panic", get(panicking)),
            vec![HeaderValue::from_static(ALLOWED_ORIGIN)],
        );

        let request = Request::builder()
            .uri("/panic")
            .body(Body::empty())
            .unwrap();
        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
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

        let response = api_router(test_state(pool), allowed_origins())
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
}
