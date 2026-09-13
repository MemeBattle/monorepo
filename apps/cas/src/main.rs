use axum::{ServiceExt, extract::Request};
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use cas::config::{Config, ConfigError, load_env_files};
use cas::http::AppError;
use std::net::Ipv4Addr;
use thiserror::Error;

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

    #[error(transparent)]
    #[diagnostic(transparent)]
    App(#[from] AppError),
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

    // Dev-only: warn in the background when the DB is missing migrations.
    // Never blocks or fails startup; compiled out of release builds.
    #[cfg(debug_assertions)]
    tokio::spawn(cas::migrations::warn_on_pending_migrations(
        config.database_url.clone(),
    ));

    // The app is a `Router` behind path normalization (see `cas::http::app`),
    // so it is `axum::ServiceExt`, not `Router`, that turns it into a
    // service factory.
    let app = cas::http::app(config).map_err(CasError::App)?;
    axum::serve(listener, ServiceExt::<Request>::into_make_service(app))
        .await
        .map_err(CasError::Io)?;

    Ok(())
}
