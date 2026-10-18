//! The Cloudflare Workers entrypoint: one request, one connection
//! (ADR 0022).
//!
//! Compiled for `wasm32-unknown-unknown` only. It holds no logic of its own —
//! every piece it composes is built and tested natively (`config`,
//! `deadline`, `db`, `http`) — because nothing here can be: the Worker types
//! exist only on this target, so CI compiles and clippy-checks this module and
//! that is all the cover it has.
//!
//! The order is the contract:
//!
//! 1. read the bindings and build everything that can fail — **before** a
//!    connection exists, so a misconfigured deployment leaks no socket and
//!    nothing fallible stands between the open and the close;
//! 2. open one `PgConnection` from the Hyperdrive binding with
//!    `statement_cache_capacity(0)`, under a deadline, holding a
//!    [`SocketAbort`] on its socket;
//! 3. serve the request through the real router on that connection;
//! 4. close the connection, and then forcibly close the socket — on every
//!    path, so that by the time `fetch` returns, `close()` has been invoked on
//!    the JS socket of every connection this request opened.

use axum::body::Body;
use axum::response::Response;
use sqlx::PgConnection;
use sqlx_cloudflare_hd::SocketAbort;
use worker::{Context, Env, HttpRequest, console_error, console_log, event};

use crate::config::WorkerConfig;
use crate::db::{CloseOutcome, Db};
use crate::deadline::with_deadline;
use crate::http::{AppParts, CloseError, build_app, health, serve_and_close};

/// The Hyperdrive binding the database is behind. Its configuration must have
/// the query cache **disabled**: the cache answers sqlx's `Parse`/`Describe`
/// itself and the `Bind` that follows lands on the wrong statement
/// (`vendor/sqlx-cloudflare-hd/VENDOR.md`, the spike).
const HYPERDRIVE: &str = "HYPERDRIVE";

#[event(fetch)]
async fn fetch(request: HttpRequest, env: Env, _ctx: Context) -> worker::Result<Response> {
    // A missing or invalid binding is a deployment that never came up, the
    // Worker analogue of the native process refusing to start — where there
    // is no CAS-shaped answer either, because nothing is listening. So it is
    // the platform's error, not a wire contract invented for it, and no
    // socket is open to leak (ADR 0022 (g)).
    let parts = match startup(&env) {
        Ok(parts) => parts,
        Err(error) => {
            console_error!("CAS cannot start: {}", error);
            return Err(worker::Error::RustError(error));
        }
    };

    // The one handle that outlives every future raced below.
    let abort = SocketAbort::new();
    let db = match open(&env, &abort).await {
        Ok(connection) => Db::connection(connection),
        Err(error) => {
            // The socket may be half-open mid-handshake, and nothing will
            // close it on its own, so it is closed here and now.
            abort.abort();
            console_error!("the database connection could not be opened: {}", error);
            Db::unavailable()
        }
    };

    let app = build_app(parts, db.clone(), health::db_router(db.clone()));
    let (served, closed) = serve_and_close(app, db, request.map(Body::new)).await;

    // The response is already decided; how the connection went is a log line.
    match closed {
        Ok(CloseOutcome::Terminated) => {}
        Ok(CloseOutcome::Dropped) => {
            console_log!("the connection was released without a graceful terminate");
        }
        Err(CloseError::Expired) => console_error!("the connection did not close in time"),
        Err(error) => console_error!("{}", error),
    }

    // Unconditional, and the last thing before returning: idempotent, and
    // harmless after a graceful close — a JS `close()` on an already-closed
    // socket is a rejected promise nobody awaits. This is what makes the
    // cleanup contract hold without a case analysis (ADR 0022 (c)).
    abort.abort();

    served
        .map(|response| response.map(Body::from))
        .map_err(|error| worker::Error::RustError(error.to_string()))
}

/// Everything that can fail, run before anything is opened.
fn startup(env: &Env) -> Result<AppParts, String> {
    let config = WorkerConfig::from_worker_env(env).map_err(|error| error.to_string())?;

    AppParts::build(
        &config.rp_id,
        &config.origin,
        config.cors_origins,
        config.issuer,
        &config.signing_key,
    )
    .map_err(|error| error.to_string())
}

/// One connection from the Hyperdrive binding, bounded by [`health::DB_TIMEOUT`].
///
/// The bound is not optional: the adapter awaits the TLS upgrade and the
/// Postgres handshake with no deadline of its own, and the Workers runtime
/// does not cut a stalled await. `statement_cache_capacity(0)` is what makes
/// the fork prepare every statement — `query!` included — as the unnamed one,
/// which is the only thing production Hyperdrive keeps straight across
/// requests.
async fn open(env: &Env, abort: &SocketAbort) -> Result<PgConnection, String> {
    let hyperdrive = env
        .hyperdrive(HYPERDRIVE)
        .map_err(|error| error.to_string())?;
    let options = sqlx_cloudflare_hd::postgres::options(&hyperdrive)
        .map_err(|error| error.to_string())?
        .statement_cache_capacity(0);

    let connect = sqlx_cloudflare_hd::postgres::connect_with_abort(&hyperdrive, &options, abort);
    match with_deadline(health::DB_TIMEOUT, connect).await {
        Ok(Ok(connection)) => Ok(connection),
        Ok(Err(error)) => Err(error.to_string()),
        Err(expired) => Err(expired.to_string()),
    }
}
