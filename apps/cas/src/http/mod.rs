//! HTTP transport: the router, the middleware stack and the error contract the
//! domain modules are mapped onto. Nothing below this module knows about axum.

pub mod error;
mod extract;
mod health;
pub mod webauthn;

use axum::{
    Router,
    http::HeaderValue,
    response::{IntoResponse, Response},
};
use sqlx::postgres::PgPoolOptions;
use thiserror::Error;
use tower::ServiceBuilder;
use tower_http::{
    catch_panic::CatchPanicLayer,
    cors::{AllowOrigin, Any, CorsLayer},
    trace::{self, TraceLayer},
};
use tracing::Level;

use crate::config::Config;
use crate::http::error::ApiError;
use crate::webauthn::build_webauthn;
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
}

pub fn app(config: Config) -> Result<Router, AppError> {
    // Lazy pool: connections open on first use, so startup succeeds even when
    // the DB is down and `/health` reports the actual connectivity.
    let pool = PgPoolOptions::new()
        .acquire_timeout(health::DB_TIMEOUT)
        .connect_lazy(&config.database_url)
        .map_err(AppError::DbPool)?;

    let webauthn = build_webauthn(&config.rp_id, &config.origin).map_err(AppError::WebauthnInit)?;

    let api_state = ApiState {
        registration: RegistrationService::new(webauthn, pool.clone()),
    };

    let router = Router::new()
        .merge(health::router(pool))
        .nest("/api/webauthn", webauthn::router(api_state));

    Ok(with_middleware(router, config.cors_origins))
}

/// Applies the middleware stack. Must be called after all routes are
/// registered: `Router::layer` only wraps already-registered routes.
///
/// `CatchPanicLayer` sits innermost so a panic response still passes through
/// the CORS and trace layers on the way out.
fn with_middleware(router: Router, cors_origins: Vec<HeaderValue>) -> Router {
    let cors_layer = CorsLayer::new()
        .allow_origin(AllowOrigin::list(cors_origins))
        .allow_methods(Any)
        .allow_headers(Any);

    router.layer(
        ServiceBuilder::new()
            .layer(
                TraceLayer::new_for_http().on_response(
                    trace::DefaultOnResponse::new()
                        .include_headers(true)
                        .level(Level::INFO),
                ),
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
    use tower::ServiceExt;

    const ALLOWED_ORIGIN: &str = "http://localhost:5173";

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
}
