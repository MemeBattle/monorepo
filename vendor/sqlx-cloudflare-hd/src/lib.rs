//! Cloudflare Hyperdrive for sqlx.
//!
//! Hyperdrive speaks the wire protocol of the database behind it, so there is
//! no driver here: this crate opens the Worker's socket to a Hyperdrive
//! binding and hands it to sqlx's own driver for that database. What you get
//! back is that driver's connection type, with everything sqlx gives it.
//!
//! One module per database, each behind a feature of the same name:
//!
//! - [`postgres`] -- a [`PgConnection`](sqlx_postgres::PgConnection).
//!
//! # What does not work
//!
//! **`sqlx::Pool`.** It needs an async runtime to spawn its maintenance tasks,
//! and a Worker cannot share a socket across requests anyway. Hyperdrive is the
//! pool: connect once per request.
//!
//! This crate only *runs* on `wasm32-unknown-unknown`, inside a Worker. It
//! compiles on other targets so that docs and `cargo check` work.

// Everything below is shared by the drivers, so it only exists with one of
// them: widen the `cfg`s to `any(...)` as drivers are added.
#[cfg(feature = "postgres")]
mod socket;

#[cfg(feature = "postgres")]
pub mod postgres;

/// Looks up the Hyperdrive binding called `name` in the Worker's environment.
#[cfg(feature = "postgres")]
fn binding(env: &worker::Env, name: &str) -> Result<worker::Hyperdrive, sqlx_core::Error> {
    env.hyperdrive(name)
        .map_err(|e| sqlx_core::Error::Configuration(e.to_string().into()))
}
