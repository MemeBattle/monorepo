//! WebAuthn ceremony state: what the server remembers between issuing a
//! challenge and checking the browser's answer.
//!
//! A ceremony spans two requests. CAS runs as several replicas that scale
//! automatically, so the two requests may land on different instances. The
//! state therefore lives in the `webauthn_ceremonies` table and never in
//! process memory: any replica can finish what another started, and a pod
//! restart loses nothing.
//!
//! Persisting the state needs webauthn-rs's `danger-allow-state-serialisation`
//! feature. The danger the library warns about is *client-side* storage: a
//! cookie the client could replay. A server-side table is the case its
//! documentation lists as safe. See `docs/adr/0002-ceremony-state-in-postgres.md`.
//!
//! A row is single-use. [`take`] deletes it in the same statement that reads
//! it, so a challenge answers exactly one request even when two finishes race,
//! and it is the caller's transaction that decides whether the deletion sticks.

use std::time::Duration;

use serde::{Serialize, de::DeserializeOwned};
use uuid::Uuid;
use webauthn_rs::prelude::{PasskeyRegistration, Url, Webauthn, WebauthnBuilder, WebauthnError};

use crate::accounts::DisplayName;

/// How long the browser is given to complete a ceremony. [`build_webauthn`]
/// puts it into every challenge, and [`start`] derives the row's expiry from
/// it, so the server and the browser count down from one number.
pub const CEREMONY_TIMEOUT: Duration = webauthn_rs::DEFAULT_AUTHENTICATOR_TIMEOUT;

/// How much longer than the browser the server keeps a ceremony. The browser
/// starts counting when the challenge reaches it, the row started earlier, and
/// the answer needs time to travel back. Without a margin the server would give
/// up first, after the authenticator has already created the credential.
pub const CEREMONY_GRACE: Duration = Duration::from_secs(30);

/// Builds the `Webauthn` instance for a relying party with the ceremony
/// timeout applied. The only place the timeout reaches webauthn-rs.
pub fn build_webauthn(rp_id: &str, origin: &Url) -> Result<Webauthn, WebauthnError> {
    WebauthnBuilder::new(rp_id, origin)?
        .timeout(CEREMONY_TIMEOUT)
        .build()
}

/// Which ceremony a row belongs to. Finishing looks rows up by kind as well as
/// by id, so a registration id can never finish a login and vice versa.
///
/// Maps to the Postgres `webauthn_ceremony_kind` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "webauthn_ceremony_kind", rename_all = "lowercase")]
pub enum CeremonyKind {
    Registration,
    /// Reserved for login (#666).
    Authentication,
}

/// A registration in flight: the account that will be created if the browser
/// comes back with a valid credential.
#[derive(Debug, Serialize, serde::Deserialize)]
pub struct PendingRegistration {
    /// Already handed to the authenticator as the WebAuthn user handle, so the
    /// account row must be created with exactly this id.
    pub account_id: Uuid,
    pub display_name: DisplayName,
    pub state: PasskeyRegistration,
}

/// Stores a ceremony and returns its id. The row lives for
/// [`CEREMONY_TIMEOUT`] plus [`CEREMONY_GRACE`], measured by the database
/// clock so that every replica agrees on it.
///
/// Expired rows are swept in the same statement: abandoned ceremonies are the
/// common case and nothing else ever removes them.
pub async fn start<'e, E, T>(
    executor: E,
    kind: CeremonyKind,
    state: &T,
) -> Result<Uuid, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
    T: Serialize,
{
    let id = Uuid::new_v4();
    let state =
        serde_json::to_value(state).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
    let ttl_secs = (CEREMONY_TIMEOUT + CEREMONY_GRACE).as_secs_f64();

    sqlx::query!(
        r#"WITH swept AS (
               DELETE FROM webauthn_ceremonies WHERE expires_at <= now()
           )
           INSERT INTO webauthn_ceremonies (id, kind, state, expires_at)
           VALUES ($1, $2, $3, now() + make_interval(secs => $4))"#,
        id,
        kind as CeremonyKind,
        state,
        ttl_secs,
    )
    .execute(executor)
    .await?;

    Ok(id)
}

/// Consumes a ceremony: returns its state and deletes the row in one
/// statement. `Ok(None)` means unknown, expired, already used, or of another
/// kind. Run it inside the transaction that finishes the ceremony, so a
/// failure later in that transaction leaves the row in place for a retry.
pub async fn take<'e, E, T>(
    executor: E,
    id: Uuid,
    kind: CeremonyKind,
) -> Result<Option<T>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
    T: DeserializeOwned,
{
    let row = sqlx::query!(
        r#"DELETE FROM webauthn_ceremonies
           WHERE id = $1 AND kind = $2 AND expires_at > now()
           RETURNING state"#,
        id,
        kind as CeremonyKind,
    )
    .fetch_optional(executor)
    .await?;

    row.map(|row| serde_json::from_value(row.state))
        .transpose()
        .map_err(|error| sqlx::Error::Decode(Box::new(error)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    #[derive(Debug, PartialEq, Serialize, serde::Deserialize)]
    struct State {
        value: u32,
    }

    /// Moves a ceremony's expiry into the past. Unchecked query on purpose:
    /// CI runs tests with SQLX_OFFLINE=true and `cargo sqlx prepare` does not
    /// cache queries from the test target.
    async fn expire(pool: &PgPool, id: Uuid) {
        sqlx::query(
            "UPDATE webauthn_ceremonies SET expires_at = now() - interval '1 second' WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn count(pool: &PgPool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM webauthn_ceremonies")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn take_returns_the_state_once(pool: PgPool) {
        let id = start(&pool, CeremonyKind::Registration, &State { value: 7 })
            .await
            .unwrap();

        let first: Option<State> = take(&pool, id, CeremonyKind::Registration).await.unwrap();
        let second: Option<State> = take(&pool, id, CeremonyKind::Registration).await.unwrap();

        assert_eq!(first, Some(State { value: 7 }));
        assert_eq!(second, None);
    }

    #[sqlx::test]
    async fn take_returns_none_for_an_unknown_id(pool: PgPool) {
        let state: Option<State> = take(&pool, Uuid::new_v4(), CeremonyKind::Registration)
            .await
            .unwrap();

        assert_eq!(state, None);
    }

    #[sqlx::test]
    async fn take_returns_none_for_another_kind(pool: PgPool) {
        let id = start(&pool, CeremonyKind::Registration, &State { value: 7 })
            .await
            .unwrap();

        let state: Option<State> = take(&pool, id, CeremonyKind::Authentication).await.unwrap();

        assert_eq!(state, None);
        // Still there for the right kind: the mismatch consumed nothing.
        assert_eq!(count(&pool).await, 1);
    }

    #[sqlx::test]
    async fn an_expired_ceremony_cannot_be_taken(pool: PgPool) {
        let id = start(&pool, CeremonyKind::Registration, &State { value: 7 })
            .await
            .unwrap();
        expire(&pool, id).await;

        let state: Option<State> = take(&pool, id, CeremonyKind::Registration).await.unwrap();

        assert_eq!(state, None);
    }

    /// Abandoned ceremonies must not accumulate: nobody ever takes them out.
    #[sqlx::test]
    async fn start_sweeps_expired_ceremonies(pool: PgPool) {
        let abandoned = start(&pool, CeremonyKind::Registration, &State { value: 1 })
            .await
            .unwrap();
        expire(&pool, abandoned).await;

        start(&pool, CeremonyKind::Registration, &State { value: 2 })
            .await
            .unwrap();

        assert_eq!(count(&pool).await, 1);
    }

    /// Inside a transaction, a rollback puts the ceremony back: a finish that
    /// fails after consuming the state can be retried.
    #[sqlx::test]
    async fn a_rolled_back_take_keeps_the_ceremony(pool: PgPool) {
        let id = start(&pool, CeremonyKind::Registration, &State { value: 7 })
            .await
            .unwrap();

        let mut tx = pool.begin().await.unwrap();
        let taken: Option<State> = take(&mut *tx, id, CeremonyKind::Registration)
            .await
            .unwrap();
        assert!(taken.is_some());
        tx.rollback().await.unwrap();

        let again: Option<State> = take(&pool, id, CeremonyKind::Registration).await.unwrap();
        assert_eq!(again, Some(State { value: 7 }));
    }
}
