use sqlx::migrate::Migrator;

/// All migrations from `apps/cas/migrations/`, embedded at compile time.
/// Applied by the `cas-migrate` binary only — the app never runs migrations.
pub static MIGRATOR: Migrator = sqlx::migrate!();

/// Dev-only startup check: warns when the DB is missing embedded migrations.
/// Runs in a background task, never blocks or fails startup, and is compiled
/// out of release builds.
#[cfg(debug_assertions)]
pub async fn warn_on_pending_migrations(database_url: String) {
    use sqlx::Connection;
    use std::collections::HashSet;

    let mut conn = match sqlx::postgres::PgConnection::connect(&database_url).await {
        Ok(conn) => conn,
        Err(error) => {
            tracing::info!(%error, "skipping the pending-migrations check: DB unreachable");
            return;
        }
    };

    // A missing `_sqlx_migrations` table means nothing was applied yet.
    let applied: HashSet<i64> = sqlx::query_scalar("SELECT version FROM _sqlx_migrations")
        .fetch_all(&mut conn)
        .await
        .map(HashSet::from_iter)
        .unwrap_or_default();

    let pending: Vec<String> = MIGRATOR
        .iter()
        .filter(|migration| !applied.contains(&migration.version))
        .map(|migration| format!("{}_{}", migration.version, migration.description))
        .collect();

    if !pending.is_empty() {
        tracing::warn!(
            pending = ?pending,
            "the database is missing {} migration(s); run cas-migrate",
            pending.len()
        );
    }
}
