//! Spike: sqlx's own Postgres driver inside workerd, over a Hyperdrive binding.
//!
//! Every endpoint takes `hd=cached` to use the `HYPERDRIVE_CACHED` binding
//! instead of `HYPERDRIVE` (a config with Hyperdrive's query cache on).
//!
//! `GET /?mode=default|nopersist|nocache|require|disable` connects, runs a
//! `query!`, a few runtime queries (each twice) and a transaction, then reports
//! timings, the backend pid and how many named statements the session holds.
//! `GET /migrate[?nolock=1][&mode=...]` runs `sqlx::migrate!` into the
//! `hd_spike` schema and drops it.
//! `GET /cacheprobe?proto=named|unnamed|simple[&mode=...]` reads a row of
//! `hd_cache.probe`, bumps it and reads it again, to show whether the second
//! read is served from the query cache (create the table by hand first).
//! `GET /raw` and `GET /rawcache` send hand-built protocol messages (src/raw.rs)
//! to pin down what Hyperdrive accepts.
//! `GET /info` shows the binding's connection string (password redacted).
//! Every response carries `x-wall-ms`, the handler's wall-clock time.

mod raw;

use std::time::Duration;

use serde::Serialize;
use sqlx::postgres::{PgConnectOptions, PgSslMode};
use sqlx::{ConnectOptions, Connection, PgConnection, Row};
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
    binding: String,
    connect_ms: f64,
    queries_ms: f64,
    tx_ms: f64,
    close_ms: f64,
    total_ms: f64,
    backend_pid: i32,
    /// Named statements the origin session already held right after connect:
    /// non-zero means another client's statements leaked into this session.
    statements_at_connect: i64,
    named_statements: i64,
    query_macro: String,
    web_time_elapsed_us: u128,
}

fn binding_name(cached: bool) -> &'static str {
    if cached {
        "HYPERDRIVE_CACHED"
    } else {
        "HYPERDRIVE"
    }
}

async fn connect(
    env: &Env,
    binding: &str,
    mode: &str,
) -> std::result::Result<PgConnection, sqlx::Error> {
    let hyperdrive = env
        .hyperdrive(binding)
        .map_err(|e| sqlx::Error::Configuration(e.to_string().into()))?;
    let mut options: PgConnectOptions = sqlx_cloudflare_hd::postgres::options(&hyperdrive)?;
    options = options
        .log_statements(log::LevelFilter::Debug)
        .log_slow_statements(log::LevelFilter::Warn, Duration::from_millis(1));
    match mode {
        "require" => options = options.ssl_mode(PgSslMode::Require),
        "disable" => options = options.ssl_mode(PgSslMode::Disable),
        _ => {}
    }
    if mode == "nocache" {
        options = options.statement_cache_capacity(0);
    }
    sqlx_cloudflare_hd::postgres::connect_with(&hyperdrive, &options).await
}

/// Like `exercise_steps`, with the failing step prefixed to the error.
async fn exercise(
    env: &Env,
    binding: &str,
    mode: &str,
) -> std::result::Result<Report, sqlx::Error> {
    let step = std::cell::Cell::new("connect");
    exercise_steps(env, binding, mode, &step)
        .await
        .map_err(|e| sqlx::Error::Protocol(format!("at {}: {e}", step.get())))
}

async fn exercise_steps(
    env: &Env,
    binding: &str,
    mode: &str,
    step: &std::cell::Cell<&'static str>,
) -> std::result::Result<Report, sqlx::Error> {
    let persistent = mode != "nopersist";
    let wt = web_time::Instant::now();

    let t0 = Date::now().as_millis() as f64;
    let mut conn = connect(env, binding, mode).await?;
    let t1 = Date::now().as_millis() as f64;

    step.set("raw_sql count at connect");
    // Simple protocol, so it neither creates nor is served from a named statement.
    let statements_at_connect: i64 = sqlx::raw_sql("SELECT count(*) FROM pg_prepared_statements")
        .fetch_one(&mut conn)
        .await?
        .try_get(0)?;

    step.set("query! (named, $1::int4)");
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
    // With the expected result for 7, so a reply to the wrong statement shows.
    let sqls = [
        ("SELECT $1::int8 + 1", 8_i64),
        ("SELECT $1::int8 * 2", 14),
        ("SELECT $1::int8 - 3", 4),
        ("SELECT $1::int8 / 4", 1),
    ];
    for round in 0..2 {
        step.set(if round == 0 {
            "runtime queries, 1st run"
        } else {
            "runtime queries, 2nd run"
        });
        for (sql, expected) in sqls {
            let got: i64 = sqlx::query_scalar(sql)
                .bind(7_i64)
                .persistent(persistent)
                .fetch_one(&mut conn)
                .await?;
            if got != expected {
                return Err(sqlx::Error::Protocol(format!(
                    "wrong result for `{sql}`: got {got}, expected {expected}"
                )));
            }
        }
    }
    let t2 = Date::now().as_millis() as f64;

    step.set("begin");
    let mut tx = conn.begin().await?;
    step.set("in transaction");
    let backend_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .persistent(persistent)
        .fetch_one(&mut *tx)
        .await?;
    let _: i64 = sqlx::query_scalar("SELECT txid_current()")
        .persistent(persistent)
        .fetch_one(&mut *tx)
        .await?;
    step.set("commit");
    tx.commit().await?;
    let t3 = Date::now().as_millis() as f64;

    step.set("raw_sql count at end");
    // Simple protocol: not cacheable as a prepared statement and not counted itself.
    let named_statements: i64 = sqlx::raw_sql("SELECT count(*) FROM pg_prepared_statements")
        .fetch_one(&mut conn)
        .await?
        .try_get(0)?;

    step.set("close");
    conn.close().await?;
    let t4 = Date::now().as_millis() as f64;

    Ok(Report {
        mode: mode.to_owned(),
        binding: binding.to_owned(),
        connect_ms: t1 - t0,
        queries_ms: t2 - t1,
        tx_ms: t3 - t2,
        close_ms: t4 - t3,
        total_ms: t4 - t0,
        backend_pid,
        statements_at_connect,
        named_statements,
        query_macro,
        web_time_elapsed_us: wt.elapsed().as_micros(),
    })
}

async fn migrate(
    env: &Env,
    binding: &str,
    locking: bool,
    mode: &str,
) -> std::result::Result<String, sqlx::Error> {
    let mut conn = connect(env, binding, mode).await?;
    let mut migrator = sqlx::migrate!("./migrations");
    // Keep the bookkeeping table out of CAS's public._sqlx_migrations.
    migrator.dangerous_set_table_name("hd_spike._sqlx_migrations");
    migrator.create_schema("hd_spike");
    migrator.set_locking(locking);
    let t0 = Date::now().as_millis() as f64;
    migrator.run(&mut conn).await?;
    let t1 = Date::now().as_millis() as f64;
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
    Ok(format!(
        "locking={locking} applied={applied} body={body} run_ms={} dropped=hd_spike",
        t1 - t0
    ))
}

#[derive(Serialize)]
struct CacheProbe {
    binding: String,
    proto: String,
    before: i64,
    updated: i64,
    after: i64,
    /// The read after the update returned an older value than the update wrote.
    stale: bool,
}

async fn read_probe(conn: &mut PgConnection, proto: &str) -> std::result::Result<i64, sqlx::Error> {
    const SQL: &str = "SELECT v FROM hd_cache.probe WHERE id = 1";
    match proto {
        "simple" => sqlx::raw_sql(SQL).fetch_one(&mut *conn).await?.try_get(0),
        "unnamed" => {
            sqlx::query_scalar(SQL)
                .persistent(false)
                .fetch_one(&mut *conn)
                .await
        }
        _ => sqlx::query_scalar(SQL).fetch_one(&mut *conn).await,
    }
}

async fn cache_probe(
    env: &Env,
    binding: &str,
    proto: &str,
    mode: &str,
) -> std::result::Result<CacheProbe, sqlx::Error> {
    let mut conn = connect(env, binding, mode).await?;
    let before = read_probe(&mut conn, proto).await?;
    let updated: i64 =
        sqlx::query_scalar("UPDATE hd_cache.probe SET v = v + 1 WHERE id = 1 RETURNING v")
            .fetch_one(&mut conn)
            .await?;
    let after = read_probe(&mut conn, proto).await?;
    conn.close().await?;
    Ok(CacheProbe {
        binding: binding.to_owned(),
        proto: proto.to_owned(),
        before,
        updated,
        after,
        stale: after != updated,
    })
}

/// Exact message sequences over a hand-rolled frontend, each case on its own
/// connection so a rejected message cannot poison the next case.
/// Read, update, read on one connection, as sqlx sends them with unnamed
/// statements (Parse+Describe+Sync, then Bind+Execute+Sync), to see what
/// Hyperdrive's query cache does to each message.
async fn raw_cache_probe(env: &Env, binding: &str) -> Result<Vec<raw::Step>> {
    use raw::*;
    const READ: &str = "SELECT v FROM hd_cache.probe WHERE id = 1";
    const BUMP: &str = "UPDATE hd_cache.probe SET v = v + 1 WHERE id = 1 RETURNING v";
    let hd = env.hyperdrive(binding)?;
    let mut conn = Raw::connect(&hd).await.map_err(worker::Error::RustError)?;
    let mut steps = Vec::new();
    for (name, sql) in [("read", READ), ("bump", BUMP), ("read again", READ)] {
        steps.push(
            conn.step(
                &format!("{name}: P D S"),
                &[parse("", sql), describe_statement(""), sync()],
            )
            .await,
        );
        steps.push(
            conn.step(&format!("{name}: B E S"), &[bind(""), execute(), sync()])
                .await,
        );
    }
    steps.push(conn.step("read, simple Q", &[simple(READ)]).await);
    conn.terminate().await;
    Ok(steps)
}

const QUERY_MACRO_SQL: &str = r#"SELECT current_database() AS "db!", $1::int4 AS "n!""#;

async fn raw_probe(env: &Env, binding: &str) -> Result<Vec<raw::Step>> {
    use raw::*;
    let hd = env.hyperdrive(binding)?;
    let mut steps = Vec::new();
    let fail = |name: &str, e: String| Step {
        name: name.into(),
        replies: String::new(),
        error: Some(format!("connect: {e}")),
    };

    let unique = format!("spike_u{}", Date::now().as_millis());
    let cases: Vec<(&str, Vec<Vec<Vec<u8>>>)> = vec![
        ("simple Q", vec![vec![simple("SELECT 1")]]),
        (
            "Q, then P(fresh, $1::int4 typed) D(S) S  [sqlx's query! after raw_sql, fresh name]",
            vec![
                vec![simple("SELECT 1")],
                vec![parse_typed(&format!("{unique}_t"), "SELECT $1::int4", &[23]), describe_statement(&format!("{unique}_t")), sync()],
            ],
        ),
        (
            "P(fresh, $1::int4 typed) D(S) S  [no preceding Q]",
            vec![vec![parse_typed(&format!("{unique}_t2"), "SELECT $1::int4", &[23]), describe_statement(&format!("{unique}_t2")), sync()]],
        ),
        (
            "new connection: P(fresh_t2 again, typed) D(S) S  [same name+SQL+types as a previous client that ended cleanly]",
            vec![vec![parse_typed(&format!("{unique}_t2"), "SELECT $1::int4", &[23]), describe_statement(&format!("{unique}_t2")), sync()]],
        ),
        (
            "new connection: P(fresh_t2 again, typed) only, then S  [no Describe]",
            vec![vec![parse_typed(&format!("{unique}_t2"), "SELECT $1::int4", &[23]), sync()]],
        ),
        (
            "new connection: P(spike_s2 untyped, seen before) D(S) S",
            vec![vec![parse("spike_s2", "SELECT 2"), describe_statement("spike_s2"), sync()]],
        ),
        (
            "P(sqlx_s_1, the query! SQL, typed) D(S) S  [exactly sqlx's first prepare]",
            vec![vec![parse_typed("sqlx_s_1", QUERY_MACRO_SQL, &[23]), describe_statement("sqlx_s_1"), sync()]],
        ),
        (
            "Q, then P(sqlx_s_1, the query! SQL, typed) D(S) S",
            vec![
                vec![simple("SELECT 1")],
                vec![parse_typed("sqlx_s_1", QUERY_MACRO_SQL, &[23]), describe_statement("sqlx_s_1"), sync()],
            ],
        ),
        (
            "unnamed P B E S",
            vec![vec![parse("", "SELECT 1"), bind(""), execute(), sync()]],
        ),
        (
            "unnamed P B E C(portal) S  [what sqlx sends]",
            vec![vec![parse("", "SELECT 1"), bind(""), execute(), close_portal(), sync()]],
        ),
        (
            "unnamed P D(S) S, then B E S  [sqlx persistent(false) without the Close]",
            vec![
                vec![parse("", "SELECT 1"), describe_statement(""), sync()],
                vec![bind(""), execute(), sync()],
            ],
        ),
        (
            "named P(s1) D(S) S, then B(s1) E S twice, then C(S s1) S",
            vec![
                vec![parse("spike_s1", "SELECT 1"), describe_statement("spike_s1"), sync()],
                vec![bind("spike_s1"), execute(), sync()],
                vec![bind("spike_s1"), execute(), sync()],
                vec![close_statement("spike_s1"), sync()],
            ],
        ),
        (
            "named P(s2) D(S) S, then B(s2) E S, left open",
            vec![
                vec![parse("spike_s2", "SELECT 2"), describe_statement("spike_s2"), sync()],
                vec![bind("spike_s2"), execute(), sync()],
            ],
        ),
        (
            "new connection: B(s2) E S without Parse [must fail: s2 belongs to another client]",
            vec![vec![bind("spike_s2"), execute(), sync()]],
        ),
        (
            "new connection: P(s2) again [fails if Hyperdrive leaked s2 into this session]",
            vec![vec![parse("spike_s2", "SELECT 2"), sync()]],
        ),
        (
            "new connection: P(s2) D(S) S, same name and SQL as another client [sqlx's prepare]",
            vec![
                vec![parse("spike_s2", "SELECT 2"), describe_statement("spike_s2"), sync()],
                vec![bind("spike_s2"), execute(), sync()],
            ],
        ),
        (
            "new connection: P(s2) D(S) S, same name, different SQL",
            vec![
                vec![parse("spike_s2", "SELECT 22"), describe_statement("spike_s2"), sync()],
                vec![bind("spike_s2"), execute(), sync()],
            ],
        ),
        (
            "new connection: P(unique) D(S) S, fresh name",
            vec![vec![
                parse(&unique, "SELECT 2"),
                describe_statement(&unique),
                sync(),
            ]],
        ),
    ];
    for (name, groups) in cases {
        match Raw::connect(&hd).await {
            Ok(mut conn) => {
                for (i, group) in groups.iter().enumerate() {
                    let label = format!("{name} #{}", i + 1);
                    let step = conn.step(&label, group).await;
                    let failed = step.error.is_some() && step.replies.is_empty();
                    steps.push(step);
                    if failed {
                        break;
                    }
                }
                conn.terminate().await;
            }
            Err(e) => steps.push(fail(name, e)),
        }
    }
    Ok(steps)
}

fn info(env: &Env, binding: &str) -> Result<String> {
    // What the binding hands out, password redacted.
    let hd = env.hyperdrive(binding)?;
    let mut cs = url::Url::parse(&hd.connection_string())
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let _ = cs.set_password(Some("REDACTED"));
    let opts = sqlx_cloudflare_hd::postgres::options(&hd)
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let mode = opts.get_ssl_mode();
    // Mirrors the vendored crate's `wants_tls`: anything but Disable/Allow opens
    // the socket with StartTls and sends an SSLRequest.
    let start_tls = !matches!(mode, PgSslMode::Disable | PgSslMode::Allow);
    Ok(format!(
        "binding={binding} connection_string={cs} host={} port={} parsed_ssl_mode={mode:?} start_tls_path={start_tls}",
        hd.host(),
        hd.port(),
    ))
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Debug);
    let wall0 = Date::now().as_millis();

    let url = req.url()?;
    let param = |name: &str| {
        url.query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.into_owned())
    };
    let binding = binding_name(param("hd").as_deref() == Some("cached"));
    let mode = param("mode").unwrap_or_else(|| "default".to_owned());

    let mut response = match url.path() {
        "/info" => Response::ok(info(&env, binding)?),
        "/raw" => Response::from_json(&raw_probe(&env, binding).await?),
        "/rawcache" => Response::from_json(&raw_cache_probe(&env, binding).await?),
        "/migrate" => {
            let locking = param("nolock").is_none();
            match migrate(&env, binding, locking, &mode).await {
                Ok(s) => Response::ok(s),
                Err(e) => Response::error(format!("migrate (locking={locking}): {e}"), 502),
            }
        }
        "/cacheprobe" => {
            let proto = param("proto").unwrap_or_else(|| "named".to_owned());
            match cache_probe(&env, binding, &proto, &mode).await {
                Ok(r) => Response::from_json(&r),
                Err(e) => Response::error(format!("cacheprobe: {e}"), 502),
            }
        }
        _ => match exercise(&env, binding, &mode).await {
            Ok(r) => Response::from_json(&r),
            Err(e) => Response::error(format!("exercise: {e}"), 502),
        },
    }?;
    // Wall-clock inside the Worker, from the start of the handler to the response.
    let wall = Date::now().as_millis() - wall0;
    response.headers_mut().set("x-wall-ms", &wall.to_string())?;
    Ok(response)
}
