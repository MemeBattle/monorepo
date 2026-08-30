mod config;
mod webauthn;

use axum::{Router, routing::get};
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    trace::{self, TraceLayer},
};
use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use webauthn_rs::prelude::PasskeyRegistration;

use crate::config::{Config, ConfigError, load_env_files};
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
    let cors_layer = CorsLayer::new()
        .allow_origin(AllowOrigin::list(config.cors_origins))
        .allow_methods(Any)
        .allow_headers(Any);
    let middleware_stack = ServiceBuilder::new()
        .layer(
            TraceLayer::new_for_http().on_response(
                trace::DefaultOnResponse::new()
                    .include_headers(true)
                    .level(Level::INFO),
            ),
        )
        .layer(cors_layer);

    let registration_state = Arc::new(Mutex::new(HashMap::<UserId, PasskeyRegistration>::new()));
    let webauthn = webauthn_rs::WebauthnBuilder::new(&config.rp_id, &config.origin)
        .map_err(CasError::WebauthnInit)?
        .build()
        .map_err(CasError::WebauthnInit)?;

    let api_state = ApiState {
        registration_state,
        webauthn,
    };

    Ok(Router::new()
        .layer(middleware_stack)
        .route("/health", get(health_check))
        .nest("/api/webauthn", webauthn_router(api_state)))
}

async fn health_check() -> &'static str {
    "OK"
}
