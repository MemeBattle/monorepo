//! `cas-migrate` — applies pending database migrations and exits.
//!
//! Kept separate from the app on purpose: instances must keep serving on the
//! previous schema during rollouts, so migrations run as their own step
//! (later: a k8s job before deploys). sqlx takes an advisory lock, so
//! concurrent runs are safe.

use sqlx::Connection;
use sqlx::postgres::PgConnection;
use thiserror::Error;

use cas::config::{Config, ConfigError, load_env_files};
use cas::migrations::MIGRATOR;

#[derive(Debug, Error, miette::Diagnostic)]
enum MigrateError {
    #[error(transparent)]
    #[diagnostic(code(cas_migrate::config_error))]
    Config(#[from] ConfigError),

    #[error("Failed to connect to the database: {0}")]
    #[diagnostic(
        code(cas_migrate::connect_error),
        help("is Postgres running and DATABASE_URL correct?")
    )]
    Connect(sqlx::Error),

    #[error("Failed to apply migrations: {0}")]
    #[diagnostic(code(cas_migrate::migrate_error))]
    Migrate(sqlx::migrate::MigrateError),
}

#[tokio::main]
async fn main() -> miette::Result<()> {
    load_env_files();
    let config = Config::from_env().map_err(MigrateError::Config)?;

    // Eager connect: fail fast with a readable error instead of on first query.
    let mut conn = PgConnection::connect(&config.database_url)
        .await
        .map_err(MigrateError::Connect)?;

    MIGRATOR
        .run(&mut conn)
        .await
        .map_err(MigrateError::Migrate)?;

    println!(
        "Migrations are up to date ({} embedded)",
        MIGRATOR.iter().len()
    );
    Ok(())
}
