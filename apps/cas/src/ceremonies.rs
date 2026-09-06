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

/// State that can be parked in the ceremony table. The kind belongs to the
/// type: a state and the row's `kind` column can never drift apart, and no
/// caller has to remember to pass the matching one.
pub trait Ceremony: Serialize + DeserializeOwned {
    const KIND: CeremonyKind;
}

/// What [`take`] found. A row that was deleted but does not deserialise is not
/// the same as no row at all: the caller must commit that deletion, or the row
/// answers the next attempt exactly as badly.
#[derive(Debug, PartialEq, Eq)]
pub enum Taken<T> {
    Found(T),
    /// A row was there and has been deleted, but its stored state no longer
    /// matches the type — a state shape that changed under a rollout. Expected,
    /// short-lived, and not a server fault: see
    /// `docs/adr/0002-ceremony-state-in-postgres.md`.
    Undecodable,
    /// Unknown id, expired, already used, or of another kind.
    Missing,
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

impl Ceremony for PendingRegistration {
    const KIND: CeremonyKind = CeremonyKind::Registration;
}

/// Stores a ceremony and returns its id. The row lives for
/// [`CEREMONY_TIMEOUT`] plus [`CEREMONY_GRACE`], measured by the database
/// clock so that every replica agrees on it.
///
/// Expired rows are swept in the same statement: abandoned ceremonies are the
/// common case and nothing else ever removes them.
pub async fn start<'e, E, T>(executor: E, state: &T) -> Result<Uuid, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
    T: Ceremony,
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
        T::KIND as CeremonyKind,
        state,
        ttl_secs,
    )
    .execute(executor)
    .await?;

    Ok(id)
}

/// Consumes a ceremony: returns its state and deletes the row in one
/// statement. Run it inside the transaction that finishes the ceremony, so a
/// failure later in that transaction leaves the row in place for a retry.
///
/// A row whose state no longer deserialises is discarded rather than reported
/// as an error: it can only be a state shape that changed under a rollout, the
/// row is worthless either way, and letting the deletion stand is what stops it
/// from failing every retry until it expires. The caller must commit for that
/// to hold — see [`Taken::Undecodable`].
pub async fn take<'e, E, T>(executor: E, id: Uuid) -> Result<Taken<T>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
    T: Ceremony,
{
    let row = sqlx::query!(
        r#"DELETE FROM webauthn_ceremonies
           WHERE id = $1 AND kind = $2 AND expires_at > now()
           RETURNING state"#,
        id,
        T::KIND as CeremonyKind,
    )
    .fetch_optional(executor)
    .await?;

    let Some(row) = row else {
        return Ok(Taken::Missing);
    };

    match serde_json::from_value(row.state) {
        Ok(state) => Ok(Taken::Found(state)),
        Err(error) => {
            tracing::warn!(
                ceremony_id = %id,
                error = %error,
                "discarding a ceremony whose stored state no longer deserialises"
            );
            Ok(Taken::Undecodable)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{PgPool, postgres::types::PgInterval};

    #[derive(Debug, PartialEq, Serialize, serde::Deserialize)]
    struct State {
        value: u32,
    }

    impl Ceremony for State {
        const KIND: CeremonyKind = CeremonyKind::Registration;
    }

    /// A state of the other kind, so a mismatch can be provoked without
    /// passing the kind by hand.
    #[derive(Debug, PartialEq, Serialize, serde::Deserialize)]
    struct LoginState {
        value: u32,
    }

    impl Ceremony for LoginState {
        const KIND: CeremonyKind = CeremonyKind::Authentication;
    }

    /// Moves a ceremony's expiry into the past. Unchecked query: see
    /// docs/TESTS.md.
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
        let id = start(&pool, &State { value: 7 }).await.unwrap();

        let first: Taken<State> = take(&pool, id).await.unwrap();
        let second: Taken<State> = take(&pool, id).await.unwrap();

        assert_eq!(first, Taken::Found(State { value: 7 }));
        assert_eq!(second, Taken::Missing);
    }

    #[sqlx::test]
    async fn take_is_missing_for_an_unknown_id(pool: PgPool) {
        let state: Taken<State> = take(&pool, Uuid::new_v4()).await.unwrap();

        assert_eq!(state, Taken::Missing);
    }

    #[sqlx::test]
    async fn take_is_missing_for_another_kind(pool: PgPool) {
        let id = start(&pool, &State { value: 7 }).await.unwrap();

        let state: Taken<LoginState> = take(&pool, id).await.unwrap();

        assert_eq!(state, Taken::Missing);
        // Still there for the right kind: the mismatch consumed nothing.
        assert_eq!(count(&pool).await, 1);
    }

    #[sqlx::test]
    async fn an_expired_ceremony_cannot_be_taken(pool: PgPool) {
        let id = start(&pool, &State { value: 7 }).await.unwrap();
        expire(&pool, id).await;

        let state: Taken<State> = take(&pool, id).await.unwrap();

        assert_eq!(state, Taken::Missing);
    }

    /// A state shape that changed under a rollout: the row is discarded, not
    /// reported as an error, so it cannot poison every retry until it expires.
    #[sqlx::test]
    async fn an_undecodable_state_is_discarded(pool: PgPool) {
        let id = Uuid::new_v4();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "INSERT INTO webauthn_ceremonies (id, kind, state, expires_at) VALUES ($1, 'registration', '{\"nope\": 1}'::jsonb, now() + interval '5 minutes')",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();

        let taken: Taken<State> = take(&pool, id).await.unwrap();

        assert_eq!(taken, Taken::Undecodable);
        assert_eq!(count(&pool).await, 0, "the row is gone, not left to rot");
    }

    /// Abandoned ceremonies must not accumulate: nobody ever takes them out.
    #[sqlx::test]
    async fn start_sweeps_expired_ceremonies(pool: PgPool) {
        let abandoned = start(&pool, &State { value: 1 }).await.unwrap();
        expire(&pool, abandoned).await;

        start(&pool, &State { value: 2 }).await.unwrap();

        assert_eq!(count(&pool).await, 1);
    }

    /// The row must outlive the challenge the browser is counting down, or the
    /// server gives up first and the credential the authenticator just created
    /// is orphaned.
    #[sqlx::test]
    async fn a_ceremony_lives_for_the_timeout_plus_the_grace(pool: PgPool) {
        let id = start(&pool, &State { value: 7 }).await.unwrap();

        // Unchecked query: see docs/TESTS.md.
        let lifetime: PgInterval = sqlx::query_scalar(
            "SELECT expires_at - created_at FROM webauthn_ceremonies WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(
            lifetime,
            PgInterval {
                months: 0,
                days: 0,
                microseconds: (CEREMONY_TIMEOUT + CEREMONY_GRACE).as_micros() as i64,
            }
        );
    }

    /// Inside a transaction, a rollback puts the ceremony back: a finish that
    /// fails after consuming the state can be retried.
    #[sqlx::test]
    async fn a_rolled_back_take_keeps_the_ceremony(pool: PgPool) {
        let id = start(&pool, &State { value: 7 }).await.unwrap();

        let mut tx = pool.begin().await.unwrap();
        let taken: Taken<State> = take(&mut *tx, id).await.unwrap();
        assert_eq!(taken, Taken::Found(State { value: 7 }));
        tx.rollback().await.unwrap();

        let again: Taken<State> = take(&pool, id).await.unwrap();
        assert_eq!(again, Taken::Found(State { value: 7 }));
    }
}
