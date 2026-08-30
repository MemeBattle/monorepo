mod config;
mod error;
mod extract;
mod webauthn;

use axum::{
    Router,
    http::HeaderValue,
    response::{IntoResponse, Response},
    routing::get,
};
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{
    catch_panic::CatchPanicLayer,
    cors::{AllowOrigin, Any, CorsLayer},
    trace::{self, TraceLayer},
};
use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use webauthn_rs::prelude::PasskeyRegistration;

use crate::config::{Config, ConfigError, load_env_files};
use crate::error::ApiError;
use crate::webauthn::{ApiState, UserId, router as webauthn_router};
use std::net::Ipv4Addr;
use std::{collections::HashMap, sync::Arc};
use thiserror::Error;
use tokio::sync::Mutex;

#[derive(Debug, Error, miette::Diagnostic)]
enum CasError {
    #[error(transparent)]
    #[diagnostic(code(cas::io_error))]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    #[diagnostic(code(cas::init_error))]
    Init(#[from] CasInitError),

    #[error(transparent)]
    #[diagnostic(code(cas::config_error))]
    Config(#[from] ConfigError),

    #[error("Failed to configure WebAuthn: {0}")]
    #[diagnostic(code(cas::webauthn_init_error))]
    WebauthnInit(webauthn_rs::prelude::WebauthnError),
}

#[derive(Debug, Error, miette::Diagnostic)]
enum CasInitError {
    #[error(transparent)]
    #[diagnostic(code(cas::init_error))]
    LoggerInitError(#[from] tracing_subscriber::util::TryInitError),
}

#[tokio::main]
async fn main() -> miette::Result<()> {
    load_env_files();

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init()
        .map_err(CasInitError::LoggerInitError)?;

    let config = Config::from_env().map_err(CasError::Config)?;

    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, config.port))
        .await
        .map_err(CasError::Io)?;

    let addr = listener.local_addr().map_err(CasError::Io)?;
    tracing::info!("Server starting on http://{}", addr);

    axum::serve(listener, app(config)?)
        .await
        .map_err(CasError::Io)?;

    Ok(())
}

fn app(config: Config) -> Result<Router, CasError> {
    let registration_state = Arc::new(Mutex::new(HashMap::<UserId, PasskeyRegistration>::new()));
    let webauthn = webauthn_rs::WebauthnBuilder::new(&config.rp_id, &config.origin)
        .map_err(CasError::WebauthnInit)?
        .build()
        .map_err(CasError::WebauthnInit)?;

    let api_state = ApiState {
        registration_state,
        webauthn,
    };

    let router = Router::new()
        .route("/health", get(health_check))
        .nest("/api/webauthn", webauthn_router(api_state));

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

async fn health_check() -> &'static str {
    "OK"
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
    };
    use tower::ServiceExt;

    const ALLOWED_ORIGIN: &str = "http://localhost:5173";

    fn test_config() -> Config {
        Config {
            port: 0,
            rp_id: "localhost".to_string(),
            origin: ALLOWED_ORIGIN.parse().unwrap(),
            cors_origins: vec![HeaderValue::from_static(ALLOWED_ORIGIN)],
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
