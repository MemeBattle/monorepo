//! Data access for `external_identities` and `external_identity_flows`.
//!
//! A flow row is single-use. [`take_flow`] deletes it in the same statement
//! that reads it, and — unlike a ceremony, whose finish is one transaction
//! (ADR 0002 (c)) — it is deliberately run *outside* one: a code exchange
//! with the provider follows, so the consume has to commit on its own and a
//! replayed `state` must find nothing even while that exchange is in flight
//! (ADR 0023 (c)).

use sqlx::PgConnection;
use uuid::Uuid;

use super::provider::PkceVerifier;
use super::{
    ExternalIdentity, FLOW_GRACE, FLOW_TIMEOUT, Intent, LinkError, ProfileSnapshot, ProviderId,
};

// `nutype` cannot derive the sqlx traits, so the ones that let a
// `ProviderId` cross the database boundary are written by hand here, next to
// the queries that use them — as `ClientId`'s are in the clients context.

/// A `ProviderId` is a Postgres text value, exactly like the `String` it
/// wraps.
impl sqlx::Type<sqlx::Postgres> for ProviderId {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        <String as sqlx::Type<sqlx::Postgres>>::type_info()
    }

    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        <String as sqlx::Type<sqlx::Postgres>>::compatible(ty)
    }
}

/// Re-validates on the way out of the database: a row whose provider does
/// not pass fails to decode instead of becoming an unchecked `ProviderId`.
/// Only CAS's own registry ever writes the column, so this cannot happen
/// short of the table being altered from outside.
impl<'r> sqlx::Decode<'r, sqlx::Postgres> for ProviderId {
    fn decode(value: sqlx::postgres::PgValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let value = <String as sqlx::Decode<'r, sqlx::Postgres>>::decode(value)?;
        Self::try_new(value).map_err(Into::into)
    }
}

/// Lets a query bind the newtype directly, without unwrapping it first.
impl sqlx::Encode<'_, sqlx::Postgres> for ProviderId {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
        let value: &str = self.as_ref();
        <&str as sqlx::Encode<'_, sqlx::Postgres>>::encode_by_ref(&value, buf)
    }
}

// Flows --------------------------------------------------------------------

/// What a flow row is written from. The id is not among them: it is drawn by
/// [`insert_flow`], because it *is* the `state` parameter and nothing before
/// the insert has any use for it.
#[derive(Debug)]
pub(crate) struct NewFlow<'a> {
    pub(crate) provider: &'a ProviderId,
    pub(crate) intent: Intent,
    pub(crate) pkce_verifier: &'a PkceVerifier,
    /// SHA-256 of the one-time secret the browser is given.
    pub(crate) browser_hash: Vec<u8>,
    /// The account a `link` flow was started for; `None` for `sign_in`.
    pub(crate) account_id: Option<Uuid>,
    pub(crate) return_to: &'a str,
}

/// A flow as [`take_flow`] read it, the moment before it was deleted.
#[derive(Debug)]
pub(crate) struct Flow {
    pub(crate) provider: ProviderId,
    pub(crate) intent: Intent,
    pub(crate) pkce_verifier: PkceVerifier,
    pub(crate) browser_hash: Vec<u8>,
    pub(crate) account_id: Option<Uuid>,
    pub(crate) return_to: String,
}

/// Stores a flow and returns its id, which is the `state` parameter the
/// provider will echo back. The row lives for [`FLOW_TIMEOUT`] plus
/// [`FLOW_GRACE`], measured by the database clock so that every replica
/// agrees on it.
///
/// Starting removes nothing: a row past its `expires_at` is ignored by
/// [`take_flow`] and stays until a separate cleanup deletes it, so
/// housekeeping never sits in the request path (ADR 0002 (d)).
pub(crate) async fn insert_flow<'e, E>(executor: E, flow: &NewFlow<'_>) -> Result<Uuid, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let id = Uuid::new_v4();
    let ttl_secs = (FLOW_TIMEOUT + FLOW_GRACE).as_secs_f64();

    sqlx::query!(
        r#"INSERT INTO external_identity_flows (
               id, provider, intent, pkce_verifier, browser_hash, account_id, return_to, expires_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))"#,
        id,
        flow.provider as _,
        flow.intent as Intent,
        flow.pkce_verifier.expose(),
        flow.browser_hash,
        flow.account_id,
        flow.return_to,
        ttl_secs,
    )
    .execute(executor)
    .await?;

    Ok(id)
}

/// Consumes a flow: returns it and deletes the row in one statement, so a
/// `state` finishes exactly once however many callbacks race.
///
/// Run it on a connection that is **not** in a transaction: the delete has to
/// commit before the code exchange, or a replay could finish a second time
/// while the first exchange is still in flight. `Ok(None)` is an unknown,
/// expired or already-consumed `state`, which the caller cannot tell apart
/// and does not need to.
pub(crate) async fn take_flow(
    conn: &mut PgConnection,
    state: Uuid,
) -> Result<Option<Flow>, sqlx::Error> {
    let row = sqlx::query!(
        r#"DELETE FROM external_identity_flows
           WHERE id = $1 AND expires_at > now()
           RETURNING
               provider AS "provider: ProviderId",
               intent AS "intent: Intent",
               pkce_verifier,
               browser_hash,
               account_id,
               return_to"#,
        state,
    )
    .fetch_optional(conn)
    .await?;

    Ok(row.map(|row| Flow {
        provider: row.provider,
        intent: row.intent,
        pkce_verifier: PkceVerifier::from_stored(row.pkce_verifier),
        browser_hash: row.browser_hash,
        account_id: row.account_id,
        return_to: row.return_to,
    }))
}

// Identities ---------------------------------------------------------------

/// Name the migration gave the `UNIQUE (provider, provider_subject)`
/// constraint. Only the queries here know it, so the mapping to the domain's
/// conflict lives next to them.
const PROVIDER_SUBJECT_UNIQUE: &str = "external_identities_provider_subject_key";

/// The constraint name is the database's way of saying "already linked".
impl From<sqlx::Error> for LinkError {
    fn from(error: sqlx::Error) -> Self {
        match &error {
            sqlx::Error::Database(db)
                if db.is_unique_violation() && db.constraint() == Some(PROVIDER_SUBJECT_UNIQUE) =>
            {
                Self::AlreadyLinked
            }
            _ => Self::Db(error),
        }
    }
}

/// Writes an identity for `account_id` and returns it as stored.
///
/// Takes an executor rather than a pool: sign-in writes it in the same
/// transaction as the account it belongs to, link writes it on its own.
pub(crate) async fn insert_identity<'e, E>(
    executor: E,
    account_id: Uuid,
    provider: &ProviderId,
    subject: &str,
    profile: &ProfileSnapshot,
) -> Result<ExternalIdentity, LinkError>
where
    E: sqlx::PgExecutor<'e>,
{
    let row = sqlx::query!(
        r#"INSERT INTO external_identities (
               account_id, provider, provider_subject,
               profile_name, profile_username, profile_picture_url
           )
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING
               id,
               account_id,
               provider AS "provider: ProviderId",
               provider_subject,
               profile_name,
               profile_username,
               profile_picture_url,
               linked_at"#,
        account_id,
        provider as _,
        subject,
        profile.name,
        profile.username,
        profile.picture,
    )
    .fetch_one(executor)
    .await?;

    Ok(ExternalIdentity {
        id: row.id,
        account_id: row.account_id,
        provider: row.provider,
        provider_subject: row.provider_subject,
        profile: ProfileSnapshot {
            name: row.profile_name,
            username: row.profile_username,
            picture: row.profile_picture_url,
        },
        linked_at: row.linked_at,
    })
}

/// The identity a provider's subject belongs to, if any. The unique
/// constraint says there is at most one.
pub(crate) async fn find_identity<'e, E>(
    executor: E,
    provider: &ProviderId,
    subject: &str,
) -> Result<Option<ExternalIdentity>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let row = sqlx::query!(
        r#"SELECT
               id,
               account_id,
               provider AS "provider: ProviderId",
               provider_subject,
               profile_name,
               profile_username,
               profile_picture_url,
               linked_at
           FROM external_identities
           WHERE provider = $1 AND provider_subject = $2"#,
        provider as _,
        subject,
    )
    .fetch_optional(executor)
    .await?;

    Ok(row.map(|row| ExternalIdentity {
        id: row.id,
        account_id: row.account_id,
        provider: row.provider,
        provider_subject: row.provider_subject,
        profile: ProfileSnapshot {
            name: row.profile_name,
            username: row.profile_username,
            picture: row.profile_picture_url,
        },
        linked_at: row.linked_at,
    }))
}

/// How many identities an account has.
///
/// Takes an executor so that the last-login-method guard can count inside the
/// transaction that holds the account's row lock
/// (`crate::webauthn::management`, ADR 0023 (g)) — the cross-context shape
/// `accounts::touch_last_seen` already uses.
pub(crate) async fn count_identities<'e, E>(
    executor: E,
    account_id: Uuid,
) -> Result<i64, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let count = sqlx::query_scalar!(
        "SELECT count(*) FROM external_identities WHERE account_id = $1",
        account_id,
    )
    .fetch_one(executor)
    .await?;

    // `count(*)` is never null; the macro types it as nullable all the same.
    Ok(count.unwrap_or(0))
}

/// An account's identities, oldest first.
pub(crate) async fn list_for_account<'e, E>(
    executor: E,
    account_id: Uuid,
) -> Result<Vec<ExternalIdentity>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let rows = sqlx::query!(
        r#"SELECT
               id,
               account_id,
               provider AS "provider: ProviderId",
               provider_subject,
               profile_name,
               profile_username,
               profile_picture_url,
               linked_at
           FROM external_identities
           WHERE account_id = $1
           ORDER BY linked_at, id"#,
        account_id,
    )
    .fetch_all(executor)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| ExternalIdentity {
            id: row.id,
            account_id: row.account_id,
            provider: row.provider,
            provider_subject: row.provider_subject,
            profile: ProfileSnapshot {
                name: row.profile_name,
                username: row.profile_username,
                picture: row.profile_picture_url,
            },
            linked_at: row.linked_at,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{Executor, PgPool};

    use crate::accounts::{AccountRepository, NewAccount};
    use crate::identities::FlowSecret;
    use crate::testing::display_name;

    fn provider() -> ProviderId {
        ProviderId::try_new("telegram").unwrap()
    }

    fn profile() -> ProfileSnapshot {
        ProfileSnapshot::new(
            Some("Ada Lovelace".to_owned()),
            Some("ada".to_owned()),
            Some("https://provider.test/ada.png".to_owned()),
        )
    }

    async fn account(pool: &PgPool, name: &str) -> Uuid {
        AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name(name)))
            .await
            .unwrap()
            .id
    }

    async fn start(pool: &PgPool, intent: Intent, account_id: Option<Uuid>) -> (Uuid, FlowSecret) {
        let secret = FlowSecret::generate().unwrap();
        let verifier = PkceVerifier::generate().unwrap();
        let id = insert_flow(
            pool,
            &NewFlow {
                provider: &provider(),
                intent,
                pkce_verifier: &verifier,
                browser_hash: secret.hash(),
                account_id,
                return_to: "/dashboard",
            },
        )
        .await
        .unwrap();
        (id, secret)
    }

    /// Unchecked query: see docs/TESTS.md.
    async fn flow_rows(pool: &PgPool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM external_identity_flows")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// The replay rejection's root: the second take of one `state` finds
    /// nothing, whatever the first one did with it.
    #[sqlx::test]
    async fn a_flow_is_taken_exactly_once(pool: PgPool) {
        let (state, secret) = start(&pool, Intent::SignIn, None).await;
        let mut conn = pool.acquire().await.unwrap();

        let first = take_flow(&mut conn, state)
            .await
            .unwrap()
            .expect("the flow");
        let second = take_flow(&mut conn, state).await.unwrap();

        assert_eq!(first.provider, provider());
        assert_eq!(first.intent, Intent::SignIn);
        assert_eq!(first.browser_hash, secret.hash());
        assert_eq!(first.account_id, None);
        assert_eq!(first.return_to, "/dashboard");
        assert!(second.is_none(), "a replayed state finds nothing");
        assert_eq!(flow_rows(&pool).await, 0);
    }

    #[sqlx::test]
    async fn taking_an_unknown_state_finds_nothing(pool: PgPool) {
        let mut conn = pool.acquire().await.unwrap();

        assert!(
            take_flow(&mut conn, Uuid::new_v4())
                .await
                .unwrap()
                .is_none()
        );
    }

    /// Expiry is the database's, and an expired row is ignored rather than
    /// swept: cleanup is a scheduled job, never the request path.
    #[sqlx::test]
    async fn an_expired_flow_finds_nothing_and_its_row_stays(pool: PgPool) {
        let (state, _) = start(&pool, Intent::SignIn, None).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE external_identity_flows SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();
        let mut conn = pool.acquire().await.unwrap();

        assert!(take_flow(&mut conn, state).await.unwrap().is_none());
        assert_eq!(flow_rows(&pool).await, 1, "nothing was swept");
    }

    /// A link flow carries the account it was started for, and the cascade
    /// takes the row with that account.
    #[sqlx::test]
    async fn a_link_flow_carries_its_account_and_cascades_with_it(pool: PgPool) {
        let account_id = account(&pool, "Ada").await;
        let (state, _) = start(&pool, Intent::Link, Some(account_id)).await;

        // Unchecked query: see docs/TESTS.md.
        pool.execute(sqlx::query("DELETE FROM accounts WHERE id = $1").bind(account_id))
            .await
            .unwrap();

        let mut conn = pool.acquire().await.unwrap();
        assert!(take_flow(&mut conn, state).await.unwrap().is_none());
        assert_eq!(flow_rows(&pool).await, 0);
    }

    /// The verifier survives the round trip as the provider will see it.
    #[sqlx::test]
    async fn the_stored_verifier_comes_back_as_it_went_in(pool: PgPool) {
        let secret = FlowSecret::generate().unwrap();
        let verifier = PkceVerifier::generate().unwrap();
        let state = insert_flow(
            &pool,
            &NewFlow {
                provider: &provider(),
                intent: Intent::SignIn,
                pkce_verifier: &verifier,
                browser_hash: secret.hash(),
                account_id: None,
                return_to: "/",
            },
        )
        .await
        .unwrap();
        let mut conn = pool.acquire().await.unwrap();

        let taken = take_flow(&mut conn, state)
            .await
            .unwrap()
            .expect("the flow");

        assert_eq!(taken.pkce_verifier.expose(), verifier.expose());
        assert_eq!(taken.pkce_verifier.challenge(), verifier.challenge());
    }

    #[sqlx::test]
    async fn an_identity_round_trips_its_snapshot(pool: PgPool) {
        let account_id = account(&pool, "Ada").await;

        let written = insert_identity(&pool, account_id, &provider(), "42", &profile())
            .await
            .unwrap();
        let found = find_identity(&pool, &provider(), "42")
            .await
            .unwrap()
            .expect("the identity");

        assert_eq!(written, found);
        assert_eq!(found.account_id, account_id);
        assert_eq!(found.provider_subject, "42");
        assert_eq!(found.profile, profile());
        assert!(
            find_identity(&pool, &provider(), "43")
                .await
                .unwrap()
                .is_none(),
            "another subject is another identity"
        );
        assert!(
            find_identity(&pool, &ProviderId::try_new("github").unwrap(), "42")
                .await
                .unwrap()
                .is_none(),
            "the same subject at another provider is another identity"
        );
    }

    /// No merging: one `(provider, subject)` belongs to one account, and a
    /// second account asking for it is a conflict rather than a 500.
    #[sqlx::test]
    async fn the_same_subject_on_a_second_account_is_a_conflict(pool: PgPool) {
        let first = account(&pool, "Ada").await;
        let second = account(&pool, "Grace").await;
        insert_identity(&pool, first, &provider(), "42", &profile())
            .await
            .unwrap();

        let error = insert_identity(
            &pool,
            second,
            &provider(),
            "42",
            &ProfileSnapshot::default(),
        )
        .await
        .unwrap_err();

        assert!(matches!(error, LinkError::AlreadyLinked), "{error:?}");
        // The same account asking twice is the same conflict.
        assert!(matches!(
            insert_identity(&pool, first, &provider(), "42", &profile())
                .await
                .unwrap_err(),
            LinkError::AlreadyLinked
        ));
    }

    #[sqlx::test]
    async fn deleting_an_account_cascades_its_identities(pool: PgPool) {
        let account_id = account(&pool, "Ada").await;
        insert_identity(&pool, account_id, &provider(), "42", &profile())
            .await
            .unwrap();

        // Unchecked query: see docs/TESTS.md.
        pool.execute(sqlx::query("DELETE FROM accounts WHERE id = $1").bind(account_id))
            .await
            .unwrap();

        assert!(
            find_identity(&pool, &provider(), "42")
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(count_identities(&pool, account_id).await.unwrap(), 0);
    }

    #[sqlx::test]
    async fn the_count_and_the_list_see_only_the_account_rows(pool: PgPool) {
        let ada = account(&pool, "Ada").await;
        let grace = account(&pool, "Grace").await;
        insert_identity(&pool, ada, &provider(), "42", &profile())
            .await
            .unwrap();
        let second = insert_identity(
            &pool,
            ada,
            &ProviderId::try_new("github").unwrap(),
            "7",
            &ProfileSnapshot::default(),
        )
        .await
        .unwrap();
        insert_identity(&pool, grace, &provider(), "99", &profile())
            .await
            .unwrap();

        assert_eq!(count_identities(&pool, ada).await.unwrap(), 2);
        assert_eq!(count_identities(&pool, grace).await.unwrap(), 1);
        assert_eq!(count_identities(&pool, Uuid::new_v4()).await.unwrap(), 0);

        let listed = list_for_account(&pool, ada).await.unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().all(|identity| identity.account_id == ada));
        assert!(listed.contains(&second));
        assert!(
            list_for_account(&pool, Uuid::new_v4())
                .await
                .unwrap()
                .is_empty()
        );
    }
}
