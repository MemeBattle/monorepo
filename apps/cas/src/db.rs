//! Shared database infrastructure: how a service reaches the database, and
//! how a `sqlx::Error` is classified for callers that must decide whether a
//! failure is the caller's to retry.

use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use sqlx::PgConnection;
#[cfg(not(target_arch = "wasm32"))]
use sqlx::{PgPool, Postgres, pool::PoolConnection};
use tokio::sync::{Mutex, OwnedMutexGuard};

/// The database as a service holds it: something to acquire a connection
/// from.
///
/// Natively it is the process-wide [`PgPool`] `http::app` built, with its
/// statement cache and its acquire timeout. On Cloudflare Workers a pool
/// cannot exist — its semaphore panics without a runtime, it spawns tasks,
/// and a socket may not be shared between requests — so there the entrypoint
/// opens one [`PgConnection`] per request from the Hyperdrive binding and
/// hands it over as [`Db::connection`](Self::connection)
/// (`docs/spike-sqlx-worker.md`, ADR 0021). Product code sees neither: it
/// acquires, and the handle decides what that means.
///
/// Cloning is cheap and shares the pool, or the one connection: the router
/// builds a single handle and every service holds a clone of it.
#[derive(Debug, Clone)]
pub struct Db(Inner);

/// What [`Db::close`] did with the handle. It describes the **Rust handle**,
/// never the socket: `Terminated` means the graceful protocol goodbye ran,
/// `Dropped` that the handle was released without one. Neither says the
/// socket is closed — on a Worker that is the entrypoint's `SocketAbort`
/// (ADR 0022 (b), (c)); natively, dropping a `PgConnection` leaves the rest
/// to the tokio runtime, as sqlx always has.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseOutcome {
    /// `sqlx::Connection::close` ran: `Terminate`, flush, stream shutdown —
    /// or, on the pool, `PgPool::close`.
    Terminated,
    /// The handle was released without a goodbye: it was not the last one, or
    /// a `DbConn` guard was still out, or there was nothing open at all.
    Dropped,
}

/// What the handle wraps. The `Connection` and `Unavailable` variants are
/// compiled on every target, so the single-connection contract — including
/// the contention error — is exercised by `cargo test` natively; the `Pool`
/// variant cannot exist on wasm32, so it is not even named there.
#[derive(Debug, Clone)]
enum Inner {
    #[cfg(not(target_arch = "wasm32"))]
    Pool(PgPool),
    Connection(Arc<Mutex<PgConnection>>),
    Unavailable,
}

impl Db {
    /// The native handle: every acquire is a checkout from `pool`.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn pool(pool: PgPool) -> Self {
        Self(Inner::Pool(pool))
    }

    /// A handle with no database behind it: every acquire fails as an outage
    /// does.
    ///
    /// What a Worker request whose per-request connect failed or timed out is
    /// served through, so it still goes through the real router and the real
    /// middleware and every endpoint answers its own already-documented
    /// database failure — 503 `database_unavailable` under `/api`, the
    /// OAuth-shaped 503 on `/oidc/token` and `/oidc/userinfo`, plain-text
    /// `DB unavailable` on `/health`. The native mirror is the lazy pool,
    /// where a database that is down is also met per endpoint rather than
    /// before routing (ADR 0022 (g)). `acquire` reports
    /// [`sqlx::Error::PoolClosed`], which [`classify`] already calls
    /// [`Failure::Unavailable`].
    pub fn unavailable() -> Self {
        Self(Inner::Unavailable)
    }

    /// The handle over one connection, which every acquire of this request
    /// shares: what the Worker entrypoint builds from its Hyperdrive
    /// binding, and what a test builds to prove a call path never acquires
    /// twice at once.
    pub fn connection(connection: PgConnection) -> Self {
        Self(Inner::Connection(Arc::new(Mutex::new(connection))))
    }

    /// A connection to run the next operation on, for as long as the guard
    /// it returns lives.
    ///
    /// Acquire it immediately before the method's first direct database
    /// operation — after the validation that needs no database has passed,
    /// and after any service it delegates to, which acquires for itself, has
    /// returned — then reuse that one guard for the rest of the method. A
    /// method that only delegates acquires nothing.
    ///
    /// Nested acquires are a bug: on Workers there is one connection per
    /// request, so a caller holding a [`DbConn`] must not call into anything
    /// that acquires again. Pass the connection down as `&mut PgConnection`,
    /// the way an open transaction already travels, never the `Db` itself.
    /// On the connection-backed handle the second acquire does not deadlock:
    /// it fails at once as [`sqlx::Error::PoolTimedOut`], which [`classify`]
    /// calls [`Failure::Unavailable`] and the API answers with a 503, so the
    /// bug surfaces as a retryable failure instead of a hung request.
    pub async fn acquire(&self) -> Result<DbConn, sqlx::Error> {
        match &self.0 {
            #[cfg(not(target_arch = "wasm32"))]
            Inner::Pool(pool) => Ok(DbConn(Guard::Pooled(pool.acquire().await?))),
            Inner::Connection(connection) => Arc::clone(connection)
                .try_lock_owned()
                .map(|guard| DbConn(Guard::Owned(guard)))
                .map_err(|_| sqlx::Error::PoolTimedOut),
            Inner::Unavailable => Err(sqlx::Error::PoolClosed),
        }
    }

    /// Gives up the handle, gracefully when this is the last one.
    ///
    /// On the connection variant the graceful path needs the owned
    /// `PgConnection`, which only the last handle with no outstanding
    /// [`DbConn`] can have: a guard holds a clone of the same `Arc`, so one
    /// `Arc::try_unwrap` answers both questions. When it succeeds, the
    /// connection is closed properly ([`CloseOutcome::Terminated`]);
    /// otherwise this handle's `Arc` is simply released
    /// ([`CloseOutcome::Dropped`]) and whoever still holds one keeps using it.
    ///
    /// The graceful close awaits the socket, so a caller that cannot wait
    /// forever — the Worker entrypoint — bounds it with
    /// [`crate::deadline::with_deadline`]: graceful close is best-effort, and
    /// forcibly closing the socket is the floor underneath it (ADR 0022 (b)).
    ///
    /// # Errors
    ///
    /// Whatever `sqlx::Connection::close` reports while saying goodbye.
    pub async fn close(self) -> Result<CloseOutcome, sqlx::Error> {
        match self.0 {
            #[cfg(not(target_arch = "wasm32"))]
            Inner::Pool(pool) => {
                pool.close().await;
                Ok(CloseOutcome::Terminated)
            }
            Inner::Connection(connection) => match Arc::try_unwrap(connection) {
                Ok(mutex) => {
                    sqlx::Connection::close(mutex.into_inner()).await?;
                    Ok(CloseOutcome::Terminated)
                }
                Err(_still_shared) => {
                    tracing::debug!(
                        "the connection handle was still shared at close: released without a graceful terminate"
                    );
                    Ok(CloseOutcome::Dropped)
                }
            },
            Inner::Unavailable => Ok(CloseOutcome::Dropped),
        }
    }
}

/// `#[sqlx::test]` hands a fixture a `PgPool`, and a service is built from
/// it exactly as the router builds one from the process pool.
#[cfg(not(target_arch = "wasm32"))]
impl From<PgPool> for Db {
    fn from(pool: PgPool) -> Self {
        Self::pool(pool)
    }
}

/// A connection held for the rest of the operation: a checkout on the pool
/// variant, the request's one connection on the other. It derefs to
/// [`PgConnection`], so `&mut *conn` is the executor a repository takes and
/// `conn.begin()` the transaction a service opens (`sqlx::Connection`).
/// Dropping it returns the connection, or releases it for the next acquire
/// of the request.
#[derive(Debug)]
pub struct DbConn(Guard);

#[derive(Debug)]
enum Guard {
    #[cfg(not(target_arch = "wasm32"))]
    Pooled(PoolConnection<Postgres>),
    Owned(OwnedMutexGuard<PgConnection>),
}

impl Deref for DbConn {
    type Target = PgConnection;

    fn deref(&self) -> &Self::Target {
        match &self.0 {
            #[cfg(not(target_arch = "wasm32"))]
            Guard::Pooled(connection) => connection,
            Guard::Owned(connection) => connection,
        }
    }
}

impl DerefMut for DbConn {
    fn deref_mut(&mut self) -> &mut Self::Target {
        match &mut self.0 {
            #[cfg(not(target_arch = "wasm32"))]
            Guard::Pooled(connection) => connection,
            Guard::Owned(connection) => connection,
        }
    }
}

/// SQLSTATE classes that say the database, not the statement, is the problem:
/// `08` connection exception, `53` insufficient resources, `57` operator
/// intervention (`57P01`, the FATAL a restart or a failover sends on an
/// established connection), `58` system error. All of them arrive as
/// [`sqlx::Error::Database`], which is why the pool variants alone are not
/// enough to recognise an outage.
const UNAVAILABLE_CLASSES: [&str; 4] = ["08", "53", "57", "58"];

/// Serialization failure and deadlock: the database is up and the statement is
/// fine, this transaction simply lost. Retrying it is the documented fix, so it
/// gets its own code rather than the generic unavailability one.
const SERIALIZATION_FAILURE: &str = "40001";
const DEADLOCK_DETECTED: &str = "40P01";

/// Why a database error is the client's to retry rather than an incident.
pub enum Failure {
    /// The database is not reachable or not accepting work.
    Unavailable,
    /// The database rejected this transaction under contention.
    Busy,
}

/// Classifies a database failure. `None` means the code has no name for it —
/// a constraint the caller did not expect, a row that will not decode, a query
/// the schema no longer matches — and it is a bug rather than a retryable
/// condition.
pub fn classify(error: &sqlx::Error) -> Option<Failure> {
    match error {
        sqlx::Error::PoolTimedOut
        | sqlx::Error::PoolClosed
        | sqlx::Error::Io(_)
        | sqlx::Error::Tls(_)
        // A broken or unexpected protocol exchange, and a BEGIN that did not
        // take: both mean the connection, not the query, went wrong.
        | sqlx::Error::Protocol(_)
        | sqlx::Error::BeginFailed => Some(Failure::Unavailable),
        sqlx::Error::Database(db) => match db.code().as_deref() {
            Some(SERIALIZATION_FAILURE | DEADLOCK_DETECTED) => Some(Failure::Busy),
            Some(code) if UNAVAILABLE_CLASSES.iter().any(|class| code.starts_with(class)) => {
                Some(Failure::Unavailable)
            }
            _ => None,
        },
        _ => None,
    }
}

/// Test-only fixtures other modules reuse to build database errors the driver
/// only ever produces from a real server message.
#[cfg(test)]
pub(crate) mod test_support {
    use sqlx::error::{DatabaseError, ErrorKind};
    use std::borrow::Cow;

    /// A database error carrying a chosen SQLSTATE. The driver only builds
    /// these from a real server message, and the failures worth testing here —
    /// a shutdown, a deadlock — cannot be provoked from a unit test.
    #[derive(Debug)]
    pub(crate) struct FakeDbError {
        pub(crate) code: String,
    }

    impl std::fmt::Display for FakeDbError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "fake database error {}", self.code)
        }
    }

    impl std::error::Error for FakeDbError {}

    impl DatabaseError for FakeDbError {
        fn message(&self) -> &str {
            "fake database error"
        }

        fn code(&self) -> Option<Cow<'_, str>> {
            Some(Cow::Borrowed(&self.code))
        }

        fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
            self
        }

        fn kind(&self) -> ErrorKind {
            match self.code.as_str() {
                "23505" => ErrorKind::UniqueViolation,
                _ => ErrorKind::Other,
            }
        }
    }

    /// Builds a [`sqlx::Error::Database`] carrying `code`.
    pub(crate) fn db_error(code: &str) -> sqlx::Error {
        sqlx::Error::Database(Box::new(FakeDbError {
            code: code.to_owned(),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::db_error;
    use super::*;
    use sqlx::Connection;

    /// A table of this test's own database, so the handle is exercised
    /// without borrowing a context's rows. Unchecked query: see
    /// docs/TESTS.md.
    async fn scratch(pool: &PgPool) {
        sqlx::query("CREATE TABLE scratch (id int PRIMARY KEY)")
            .execute(pool)
            .await
            .unwrap();
    }

    /// Unchecked query: see docs/TESTS.md.
    async fn rows(pool: &PgPool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM scratch")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Unchecked query: see docs/TESTS.md.
    async fn insert(conn: &mut PgConnection, id: i32) {
        sqlx::query("INSERT INTO scratch (id) VALUES ($1)")
            .bind(id)
            .execute(conn)
            .await
            .unwrap();
    }

    /// What a service does: acquire, then run on `&mut *conn`.
    #[sqlx::test]
    async fn a_pooled_handle_lends_a_connection_to_run_on(pool: PgPool) {
        scratch(&pool).await;
        let db = Db::pool(pool.clone());

        let mut conn = db.acquire().await.unwrap();
        insert(&mut conn, 1).await;

        assert_eq!(rows(&pool).await, 1);
    }

    /// The other shape: a transaction begun on the acquired connection, and
    /// the same guard reused for the next one.
    #[sqlx::test]
    async fn a_transaction_on_an_acquired_connection_commits_and_rolls_back(pool: PgPool) {
        scratch(&pool).await;
        let db = Db::pool(pool.clone());
        let mut conn = db.acquire().await.unwrap();

        let mut tx = conn.begin().await.unwrap();
        insert(&mut tx, 1).await;
        tx.commit().await.unwrap();
        assert_eq!(rows(&pool).await, 1);

        let mut tx = conn.begin().await.unwrap();
        insert(&mut tx, 2).await;
        tx.rollback().await.unwrap();

        assert_eq!(rows(&pool).await, 1, "the rollback wrote nothing");
    }

    /// The Worker's handle: one connection, lent out once at a time, and a
    /// second overlapping acquire refused at once rather than waited for.
    #[sqlx::test]
    async fn a_connection_handle_lends_its_one_connection_in_turn(pool: PgPool) {
        scratch(&pool).await;
        let db = Db::connection(pool.acquire().await.unwrap().detach());

        let mut conn = db.acquire().await.unwrap();
        insert(&mut conn, 1).await;
        let contended = db.acquire().await.unwrap_err();
        assert!(
            matches!(contended, sqlx::Error::PoolTimedOut),
            "{contended:?}"
        );
        assert!(matches!(classify(&contended), Some(Failure::Unavailable),));

        drop(conn);
        let mut conn = db.acquire().await.unwrap();
        insert(&mut conn, 2).await;
        drop(conn);

        assert_eq!(rows(&pool).await, 2);
    }

    /// Every service holds a clone of the one handle, so a clone must
    /// contend exactly as the original does.
    #[sqlx::test]
    async fn a_clone_of_a_connection_handle_contends_with_it(pool: PgPool) {
        let db = Db::connection(pool.acquire().await.unwrap().detach());
        let clone = db.clone();

        let conn = db.acquire().await.unwrap();
        assert!(matches!(
            clone.acquire().await.unwrap_err(),
            sqlx::Error::PoolTimedOut
        ));

        drop(conn);
        assert!(clone.acquire().await.is_ok());
    }

    /// The close path of the Worker request lifecycle: the entrypoint's last
    /// handle, with every service's clone and every guard gone, says goodbye
    /// properly.
    #[sqlx::test]
    async fn close_on_the_last_handle_terminates_gracefully(pool: PgPool) {
        scratch(&pool).await;
        let db = Db::connection(pool.acquire().await.unwrap().detach());

        let mut conn = db.acquire().await.unwrap();
        insert(&mut conn, 1).await;
        drop(conn);

        assert_eq!(db.close().await.unwrap(), CloseOutcome::Terminated);
        assert_eq!(rows(&pool).await, 1, "the work before the close committed");
    }

    /// A clone left behind — a service whose future outlived the router —
    /// cannot be terminated, so the handle is released instead and the clone
    /// still works.
    #[sqlx::test]
    async fn close_with_a_live_clone_falls_back_to_dropping(pool: PgPool) {
        scratch(&pool).await;
        let db = Db::connection(pool.acquire().await.unwrap().detach());
        let clone = db.clone();

        assert_eq!(db.close().await.unwrap(), CloseOutcome::Dropped);

        let mut conn = clone.acquire().await.unwrap();
        insert(&mut conn, 1).await;
        drop(conn);
        assert_eq!(rows(&pool).await, 1);
    }

    /// The other way the connection is not this caller's to take: a guard is
    /// still out, which is a clone of the same `Arc`.
    #[sqlx::test]
    async fn close_while_the_connection_is_held_falls_back(pool: PgPool) {
        scratch(&pool).await;
        let db = Db::connection(pool.acquire().await.unwrap().detach());
        let mut conn = db.acquire().await.unwrap();

        assert_eq!(db.close().await.unwrap(), CloseOutcome::Dropped);

        insert(&mut conn, 1).await;
        drop(conn);
        assert_eq!(rows(&pool).await, 1, "the guard outlived the close");
    }

    #[sqlx::test]
    async fn close_on_a_pool_closes_the_pool(pool: PgPool) {
        let db = Db::pool(pool.clone());

        assert_eq!(db.close().await.unwrap(), CloseOutcome::Terminated);
        assert!(pool.is_closed());
    }

    /// What a Worker request whose connect failed is served through: nothing
    /// to acquire, and the failure is the retryable one every endpoint
    /// already answers.
    #[tokio::test]
    async fn an_unavailable_handle_refuses_every_acquire() {
        let db = Db::unavailable();

        let error = db.acquire().await.unwrap_err();
        assert!(matches!(error, sqlx::Error::PoolClosed), "{error:?}");
        assert!(matches!(classify(&error), Some(Failure::Unavailable)));

        assert_eq!(db.close().await.unwrap(), CloseOutcome::Dropped);
    }

    #[test]
    fn a_pool_timeout_is_unavailable() {
        assert!(matches!(
            classify(&sqlx::Error::PoolTimedOut),
            Some(Failure::Unavailable)
        ));
    }

    /// 57P01: the FATAL Postgres sends when an admin, a restart or a failover
    /// terminates the connection. It arrives on an established connection, so
    /// no pool variant sees it.
    #[test]
    fn a_terminated_connection_is_unavailable() {
        assert!(matches!(
            classify(&db_error("57P01")),
            Some(Failure::Unavailable)
        ));
    }

    #[test]
    fn a_connection_exception_is_unavailable() {
        assert!(matches!(
            classify(&db_error("08006")),
            Some(Failure::Unavailable)
        ));
    }

    #[test]
    fn a_deadlock_is_a_busy_database() {
        assert!(matches!(classify(&db_error("40P01")), Some(Failure::Busy)));
    }

    #[test]
    fn a_serialization_failure_is_a_busy_database() {
        assert!(matches!(classify(&db_error("40001")), Some(Failure::Busy)));
    }

    /// A constraint violation is a caller that forgot to handle it: a bug, not
    /// a retryable outage.
    #[test]
    fn a_unique_violation_is_not_classified() {
        assert!(classify(&db_error("23505")).is_none());
    }

    #[test]
    fn a_decode_error_is_not_classified() {
        assert!(classify(&sqlx::Error::Decode("not a uuid".into())).is_none());
    }
}
