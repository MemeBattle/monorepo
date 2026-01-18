mod webauthn;

use axum::{Router, http::HeaderValue, routing::get};
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::{self, TraceLayer},
};
use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use webauthn_rs::prelude::{PasskeyRegistration, Url};

use crate::webauthn::{ApiState, UserId, router as webauthn_router};
use std::{collections::HashMap, sync::Arc};
use thiserror::Error;
use tokio::sync::Mutex;

#[derive(Debug, Error, miette::Diagnostic)]
enum CasError {
    #[error(transparent)]
    #[diagnostic(code(cas::io_error))]
    IoError(#[from] std::io::Error),

    #[error(transparent)]
    #[diagnostic(code(cas::init_error))]
    InitError(#[from] CasInitError),
}

#[derive(Debug, Error, miette::Diagnostic)]
enum CasInitError {
    #[error(transparent)]
    #[diagnostic(code(cas::init_error))]
    LoggerInitError(#[from] tracing_subscriber::util::TryInitError),
}

#[tokio::main]
async fn main() -> miette::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init()
        .map_err(CasInitError::LoggerInitError)?;

    let listener = TcpListener::bind("0.0.0.0:3000")
        .await
        .map_err(CasError::IoError)?;

    let addr = listener.local_addr().map_err(CasError::IoError)?;
    tracing::info!("Server starting on http://{}", addr);

    axum::serve(listener, app())
        .await
        .map_err(CasError::IoError)?;

    Ok(())
}

fn app() -> Router {
    let cors_layer = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
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
    let webauthn = webauthn_rs::WebauthnBuilder::new(
        "localhost",
        &"http://localhost:5173".parse::<Url>().unwrap(),
    )
    .unwrap()
    .build()
    .unwrap();

    let api_state = ApiState {
        registration_state,
        webauthn,
    };

    Router::new()
        .layer(middleware_stack)
        .route("/health", get(health_check))
        .nest("/api/webauthn", webauthn_router(api_state))
}

async fn health_check() -> &'static str {
    "OK"
}
