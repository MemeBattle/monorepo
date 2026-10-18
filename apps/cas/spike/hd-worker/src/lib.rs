//! Spike: sqlx's own Postgres driver inside workerd, over a Hyperdrive binding.
//!
//! `GET /?mode=default|nopersist|nocache` connects, runs a `query!`, a few
//! runtime queries (each twice) and a transaction, then reports timings, the
//! backend pid and how many named statements the session holds.
//! `GET /migrate` runs `sqlx::migrate!` into the `hd_spike` schema and drops it.

use std::time::Duration;

use serde::Serialize;
use sqlx::postgres::PgConnectOptions;
use sqlx::{ConnectOptions, Connection, PgConnection};
use worker::{event, Context, Date, Env, Request, Response, Result};

/// Forwards sqlx's `log` records (QueryLogger) to the Workers console, so its
/// `Instant`-based elapsed times are actually computed and formatted.
struct ConsoleLogger;

impl log::Log for ConsoleLogger {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }
    fn log(&self, record: &log::Record) {
        worker::console_log!(
            "[{}] {}: {}",
            record.level(),
            record.target(),
            record.args()
        );
    }
    fn flush(&self) {}
}

static LOGGER: ConsoleLogger = ConsoleLogger;

#[derive(Serialize)]
struct Report {
    mode: String,
    connect_ms: f64,
    queries_ms: f64,
    tx_ms: f64,
    close_ms: f64,
    total_ms: f64,
    backend_pid: i32,
    named_statements: i64,
    query_macro: String,
    web_time_elapsed_us: u128,
}

async fn connect(env: &Env, mode: &str) -> std::result::Result<PgConnection, sqlx::Error> {
    let hyperdrive = env
        .hyperdrive("HYPERDRIVE")
        .map_err(|e| sqlx::Error::Configuration(e.to_string().into()))?;
    let mut options: PgConnectOptions = sqlx_cloudflare_hd::postgres::options(&hyperdrive)?;
    options = options
        .log_statements(log::LevelFilter::Debug)
        .log_slow_statements(log::LevelFilter::Warn, Duration::from_millis(1));
    match mode {
        "require" => options = options.ssl_mode(sqlx::postgres::PgSslMode::Require),
        "disable" => options = options.ssl_mode(sqlx::postgres::PgSslMode::Disable),
        _ => {}
    }
    if mode == "nocache" {
        options = options.statement_cache_capacity(0);
    }
    sqlx_cloudflare_hd::postgres::connect_with(&hyperdrive, &options).await
}

async fn exercise(env: &Env, mode: &str) -> std::result::Result<Report, sqlx::Error> {
    let persistent = mode != "nopersist";
    let wt = web_time::Instant::now();

    let t0 = Date::now().as_millis() as f64;
    let mut conn = connect(env, mode).await?;
    let t1 = Date::now().as_millis() as f64;

    // Checked against the offline cache in .sqlx (SQLX_OFFLINE=true).
    let row = sqlx::query!(
        r#"SELECT current_database() AS "db!", $1::int4 AS "n!""#,
        42
    )
    .fetch_one(&mut conn)
    .await?;
    let query_macro = format!("{} {}", row.db, row.n);

    // Four distinct statements, each twice: the second run hits the per-connection
    // statement cache when it is on.
    let sqls = [
        "SELECT $1::int8 + 1",
        "SELECT $1::int8 * 2",
        "SELECT $1::int8 - 3",
        "SELECT $1::int8 / 4",
    ];
    for _ in 0..2 {
        for sql in sqls {
            let _: i64 = sqlx::query_scalar(sql)
                .bind(7_i64)
                .persistent(persistent)
                .fetch_one(&mut conn)
                .await?;
        }
    }
    let t2 = Date::now().as_millis() as f64;

    let mut tx = conn.begin().await?;
    let backend_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .persistent(persistent)
        .fetch_one(&mut *tx)
        .await?;
    let _: i64 = sqlx::query_scalar("SELECT txid_current()")
        .persistent(persistent)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    let t3 = Date::now().as_millis() as f64;

    // Unnamed itself, so it does not count itself.
    let named_statements: i64 = sqlx::query_scalar("SELECT count(*) FROM pg_prepared_statements")
        .persistent(false)
        .fetch_one(&mut conn)
        .await?;

    conn.close().await?;
    let t4 = Date::now().as_millis() as f64;

    Ok(Report {
        mode: mode.to_owned(),
        connect_ms: t1 - t0,
        queries_ms: t2 - t1,
        tx_ms: t3 - t2,
        close_ms: t4 - t3,
        total_ms: t4 - t0,
        backend_pid,
        named_statements,
        query_macro,
        web_time_elapsed_us: wt.elapsed().as_micros(),
    })
}

async fn migrate(env: &Env) -> std::result::Result<String, sqlx::Error> {
    let mut conn = connect(env, "default").await?;
    let mut migrator = sqlx::migrate!("./migrations");
    // Keep the bookkeeping table out of CAS's public._sqlx_migrations.
    migrator.dangerous_set_table_name("hd_spike._sqlx_migrations");
    migrator.create_schema("hd_spike");
    migrator.run(&mut conn).await?;
    let body: String = sqlx::query_scalar("SELECT body FROM hd_spike.spike_note WHERE id = 1")
        .fetch_one(&mut conn)
        .await?;
    let applied: i64 = sqlx::query_scalar("SELECT count(*) FROM hd_spike._sqlx_migrations")
        .fetch_one(&mut conn)
        .await?;
    sqlx::raw_sql("DROP SCHEMA hd_spike CASCADE")
        .execute(&mut conn)
        .await?;
    conn.close().await?;
    Ok(format!("applied={applied} body={body} dropped=hd_spike"))
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Debug);

    let url = req.url()?;
    if url.path() == "/info" {
        // What the local binding hands out, password redacted.
        let hd = env.hyperdrive("HYPERDRIVE")?;
        let mut cs = url::Url::parse(&hd.connection_string())
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        let _ = cs.set_password(Some("REDACTED"));
        let opts = sqlx_cloudflare_hd::postgres::options(&hd)
            .map_err(|e| worker::Error::RustError(e.to_string()))?;
        return Response::ok(format!(
            "connection_string={cs} host={} port={} parsed_ssl_mode={:?}",
            hd.host(),
            hd.port(),
            opts.get_ssl_mode()
        ));
    }
    if url.path() == "/migrate" {
        return match migrate(&env).await {
            Ok(s) => Response::ok(s),
            Err(e) => Response::error(format!("migrate: {e}"), 502),
        };
    }
    let mode = url
        .query_pairs()
        .find(|(k, _)| k == "mode")
        .map_or_else(|| "default".to_owned(), |(_, v)| v.into_owned());
    match exercise(&env, &mode).await {
        Ok(r) => Response::from_json(&r),
        Err(e) => Response::error(format!("exercise: {e}"), 502),
    }
}
