//! Data access for `accounts`.

use std::time::Duration;

use sqlx::PgPool;
use uuid::Uuid;

use super::{Account, AccountType, DisplayName, Email, NewAccount};
use crate::clients::ClientId;

// `nutype` cannot derive the sqlx traits, so the three that let a
// `DisplayName` cross the database boundary are written by hand here, next to
// the queries that use them. Together they make the reader — not the table,
// which has no CHECK — the guarantee that a stored display name is valid.

/// A `DisplayName` is a Postgres text value, exactly like the `String` it
/// wraps.
impl sqlx::Type<sqlx::Postgres> for DisplayName {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        <String as sqlx::Type<sqlx::Postgres>>::type_info()
    }

    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        <String as sqlx::Type<sqlx::Postgres>>::compatible(ty)
    }
}

/// Re-validates on the way out of the database: a row that does not pass fails
/// to decode instead of becoming an unchecked `DisplayName`.
impl<'r> sqlx::Decode<'r, sqlx::Postgres> for DisplayName {
    fn decode(value: sqlx::postgres::PgValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let value = <String as sqlx::Decode<'r, sqlx::Postgres>>::decode(value)?;
        Self::try_new(value).map_err(Into::into)
    }
}

/// Lets a query bind the newtype directly, without unwrapping it to a
/// `String` first.
impl sqlx::Encode<'_, sqlx::Postgres> for DisplayName {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
        let value: &str = self.as_ref();
        <&str as sqlx::Encode<'_, sqlx::Postgres>>::encode_by_ref(&value, buf)
    }
}

/// Inserts an account with any executor — a pool, or the transaction that
/// registration uses to write an account and its first passkey together.
///
/// `created_at` and `last_seen_at` are written here rather than left to the
/// columns' `DEFAULT now()`, both as `statement_timestamp()`: the database
/// clock (ADR 0002 (d)), one value per statement so the two are equal, and
/// the moment this statement arrived rather than the moment its transaction
/// began. The difference matters to the guest grant, whose transaction may
/// wait for its client's lock before it inserts: its account must be stamped
/// with the time it was written, or it could already lie outside the window
/// the next mint counts (ADR 0014 (e)). For any other account it is the few
/// milliseconds between the transaction's start and this statement.
pub(crate) async fn insert<'e, E>(executor: E, account: NewAccount) -> Result<Account, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query_as!(
        Account,
        r#"INSERT INTO accounts (
               id, display_name, type, email, created_by_client_id, created_at, last_seen_at
           )
           VALUES ($1, $2, $3, $4, $5, statement_timestamp(), statement_timestamp())
           RETURNING
               id,
               display_name AS "display_name: DisplayName",
               type AS "type: AccountType",
               email,
               created_by_client_id AS "created_by_client_id: ClientId",
               created_at,
               last_seen_at"#,
        account.id,
        // `as _`: the macro infers `&str` for a text parameter, so the cast is
        // what makes it use the `Encode` impl for the newtype instead.
        account.display_name as _,
        account.r#type as AccountType,
        account.email,
        account.created_by_client_id as _,
    )
    .fetch_one(executor)
    .await
}

/// Looks an account up by id with any executor, so login can read it inside
/// the transaction that also records the passkey use. `Ok(None)` means no such
/// account.
pub(crate) async fn get<'e, E>(executor: E, id: Uuid) -> Result<Option<Account>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query_as!(
        Account,
        r#"SELECT
               id,
               display_name AS "display_name: DisplayName",
               type AS "type: AccountType",
               email,
               created_by_client_id AS "created_by_client_id: ClientId",
               created_at,
               last_seen_at
           FROM accounts
           WHERE id = $1"#,
        id,
    )
    .fetch_optional(executor)
    .await
}

/// How many accounts `client_id` minted in the last `window`, whatever their
/// type is now: an upgraded guest still counts for its minute. The guest
/// grant's rate limit (ADR 0014 (e)).
///
/// The count is exact only while the caller holds the client's guest-mint
/// lock (`clients::lock_guest_grant_limit`) on the same transaction, from
/// before this count until the commit of the account it may insert: under
/// READ COMMITTED a count does not see another transaction's uncommitted
/// insert, and without the lock two mints at the boundary would both pass.
///
/// The cutoff is `statement_timestamp()`: the database clock (ADR 0002 (d)),
/// read when this statement arrives — after the lock was obtained — not when
/// the transaction began, which `now()` would be. Not `clock_timestamp()`
/// either: it is volatile, so the planner could not use the range as an
/// index condition and the count would read every account the client ever
/// minted; `statement_timestamp()` is stable, and the range is scanned in
/// `accounts_created_by_client_id_created_at_idx` next to the client id. A
/// test repeats this SQL to check that plan; the two must stay the same.
pub(crate) async fn count_created_by_client<'e, E>(
    executor: E,
    client_id: &ClientId,
    window: Duration,
) -> Result<i64, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    // `count(*)` is never NULL, hence the `!`.
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!"
           FROM accounts
           WHERE created_by_client_id = $1
             AND created_at > statement_timestamp() - make_interval(secs => $2)"#,
        client_id as _,
        window.as_secs_f64(),
    )
    .fetch_one(executor)
    .await
}

/// Draws the number of a new guest's generated display name from
/// `guest_display_name_seq`. A sequence because every replica shares it and
/// it never hands out a value twice; a number drawn by a mint that then rolls
/// back is simply skipped. The guest grant draws it on its transaction, after
/// the rate limit let the mint through (ADR 0014 (b)).
pub(crate) async fn next_guest_number<'e, E>(executor: E) -> Result<i64, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    // `nextval` is never NULL, hence the `!`.
    sqlx::query_scalar!(r#"SELECT nextval('guest_display_name_seq') AS "number!""#)
        .fetch_one(executor)
        .await
}

/// Marks an account as active now. Session creation calls it inside its own
/// transaction; guest GC will read what it writes.
pub(crate) async fn touch_last_seen<'e, E>(executor: E, id: Uuid) -> Result<(), sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query!("UPDATE accounts SET last_seen_at = now() WHERE id = $1", id)
        .execute(executor)
        .await?;

    Ok(())
}

/// Sets or clears an account's email. `Ok(false)` means no such account.
/// The column takes the address as text: the `Email` guards the write, and
/// the reader does not re-validate (see [`Account::email`]).
pub(crate) async fn set_email<'e, E>(
    executor: E,
    id: Uuid,
    email: Option<&Email>,
) -> Result<bool, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let email: Option<&str> = email.map(AsRef::as_ref);
    let result = sqlx::query!("UPDATE accounts SET email = $1 WHERE id = $2", email, id)
        .execute(executor)
        .await?;

    Ok(result.rows_affected() == 1)
}

/// Data access for `accounts`.
#[derive(Debug, Clone)]
pub struct AccountRepository {
    pool: PgPool,
}

impl AccountRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Inserts an account and returns the stored row, including the
    /// database-assigned timestamps.
    pub async fn create(&self, account: NewAccount) -> Result<Account, sqlx::Error> {
        insert(&self.pool, account).await
    }

    /// Looks an account up by id. `Ok(None)` means no such account.
    pub async fn get(&self, id: Uuid) -> Result<Option<Account>, sqlx::Error> {
        get(&self.pool, id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{display_name, register_public_client};

    #[sqlx::test]
    async fn creates_a_full_account_with_an_email(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let account = repository
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();

        assert_eq!(account.display_name.as_ref(), "Ada");
        assert_eq!(account.r#type, AccountType::Full);
        assert_eq!(account.email.as_deref(), Some("ada@example.com"));
        // A fresh account has never been seen after its creation.
        assert_eq!(account.last_seen_at, account.created_at);
    }

    const CLIENT: &str = "ligretto";
    const WINDOW: Duration = Duration::from_secs(60);

    fn client_id(value: &str) -> ClientId {
        ClientId::try_new(value).unwrap()
    }

    /// A guest needs the client that minted it: the column is a foreign key.
    async fn guest_of(pool: &PgPool, client: &str) -> Account {
        let number = next_guest_number(pool).await.unwrap();
        insert(pool, NewAccount::guest(client_id(client), number))
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn creates_a_guest_with_its_client_and_without_an_email(pool: PgPool) {
        register_public_client(&pool, CLIENT, &[]).await;
        let repository = AccountRepository::new(pool.clone());

        let account = repository
            .create(NewAccount::guest(client_id(CLIENT), 7))
            .await
            .unwrap();

        assert_eq!(account.r#type, AccountType::Guest);
        assert_eq!(account.email, None);
        assert_eq!(account.display_name.as_ref(), "Guest 7");
        assert_eq!(account.created_by_client_id, Some(client_id(CLIENT)));
        assert_eq!(repository.get(account.id).await.unwrap(), Some(account));
    }

    /// The sequence never repeats a number, so two guests minted through it
    /// are named apart, `Guest <n>` each.
    #[sqlx::test]
    async fn guests_drawn_from_the_sequence_have_distinct_names(pool: PgPool) {
        register_public_client(&pool, CLIENT, &[]).await;

        let first = guest_of(&pool, CLIENT).await;
        let second = guest_of(&pool, CLIENT).await;

        for guest in [&first, &second] {
            let number = guest
                .display_name
                .as_ref()
                .strip_prefix("Guest ")
                .unwrap_or_else(|| panic!("{:?}", guest.display_name));
            assert!(number.parse::<i64>().is_ok(), "{:?}", guest.display_name);
        }
        assert_ne!(first.display_name, second.display_name);
    }

    #[sqlx::test]
    async fn a_full_account_has_no_client(pool: PgPool) {
        let account = AccountRepository::new(pool)
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();

        assert_eq!(account.created_by_client_id, None);
    }

    /// Provenance, not ownership: deleting the client keeps the account,
    /// which may have become a person's by then, and unlinks it.
    #[sqlx::test]
    async fn deleting_the_client_keeps_the_account_and_unlinks_it(pool: PgPool) {
        register_public_client(&pool, CLIENT, &[]).await;
        let guest = guest_of(&pool, CLIENT).await;

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("DELETE FROM clients WHERE id = $1")
            .bind(CLIENT)
            .execute(&pool)
            .await
            .unwrap();

        let stored = get(&pool, guest.id).await.unwrap().unwrap();
        assert_eq!(stored.created_by_client_id, None);
        assert_eq!(stored.r#type, AccountType::Guest);
    }

    #[sqlx::test]
    async fn the_count_is_of_one_client_and_inside_the_window(pool: PgPool) {
        register_public_client(&pool, CLIENT, &[]).await;
        register_public_client(&pool, "other", &[]).await;
        let aged = guest_of(&pool, CLIENT).await;
        guest_of(&pool, CLIENT).await;
        guest_of(&pool, CLIENT).await;
        guest_of(&pool, "other").await;
        AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();

        assert_eq!(
            count_created_by_client(&pool, &client_id(CLIENT), WINDOW)
                .await
                .unwrap(),
            3
        );

        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE accounts SET created_at = now() - interval '61 seconds' WHERE id = $1")
            .bind(aged.id)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(
            count_created_by_client(&pool, &client_id(CLIENT), WINDOW)
                .await
                .unwrap(),
            2
        );
        assert_eq!(
            count_created_by_client(&pool, &client_id("other"), WINDOW)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            count_created_by_client(&pool, &client_id("nobody"), WINDOW)
                .await
                .unwrap(),
            0
        );
    }

    /// An insert that comes late in its transaction — a guest mint that
    /// waited for its client's lock — is stamped when it is written, not
    /// when the transaction began.
    #[sqlx::test]
    async fn an_account_is_stamped_when_it_is_written_not_when_its_transaction_began(pool: PgPool) {
        let mut tx = pool.begin().await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        let began: time::OffsetDateTime = sqlx::query_scalar("SELECT now()")
            .fetch_one(&mut *tx)
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(300)).await;

        let account = insert(&mut *tx, NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        tx.commit().await.unwrap();

        assert!(
            account.created_at - began >= time::Duration::milliseconds(300),
            "created_at {} is the transaction's start {began}",
            account.created_at
        );
        assert_eq!(account.last_seen_at, account.created_at);
    }

    /// The window is measured from the moment the count runs, not from the
    /// transaction's start. The row is inside the window as the
    /// transaction's start sees it and outside it by the time the count
    /// runs; extra delay only ages it further, so the test cannot flake
    /// towards a false failure.
    #[sqlx::test]
    async fn the_window_is_measured_when_the_count_runs(pool: PgPool) {
        register_public_client(&pool, CLIENT, &[]).await;
        let mut tx = pool.begin().await.unwrap();
        let guest = insert(&mut *tx, NewAccount::guest(client_id(CLIENT), 1))
            .await
            .unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "UPDATE accounts
             SET created_at = now() - make_interval(secs => $2) + interval '300 milliseconds'
             WHERE id = $1",
        )
        .bind(guest.id)
        .bind(WINDOW.as_secs_f64())
        .execute(&mut *tx)
        .await
        .unwrap();
        tokio::time::sleep(Duration::from_millis(600)).await;

        let count = count_created_by_client(&mut *tx, &client_id(CLIENT), WINDOW)
            .await
            .unwrap();

        assert_eq!(count, 0);
    }

    /// The count must stay an index range scan over the client's recent
    /// accounts: guest GC is deferred, so a count that read the client's
    /// whole history would grow without bound. Sequential and bitmap scans
    /// are switched off so the planner shows whether the index *can* serve
    /// both conditions, whatever the table's size.
    #[sqlx::test]
    async fn the_count_reads_the_index_for_the_client_and_the_window(pool: PgPool) {
        register_public_client(&pool, CLIENT, &[]).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "INSERT INTO accounts (display_name, type, created_by_client_id, created_at)
             SELECT 'Guest', 'guest', $1, now() - make_interval(mins => n)
             FROM generate_series(1, 300) AS n",
        )
        .bind(CLIENT)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("ANALYZE accounts")
            .execute(&pool)
            .await
            .unwrap();

        let mut tx = pool.begin().await.unwrap();
        for setting in [
            "SET LOCAL enable_seqscan = off",
            "SET LOCAL enable_bitmapscan = off",
        ] {
            sqlx::query(setting).execute(&mut *tx).await.unwrap();
        }
        // The SQL of `count_created_by_client`, repeated: the checked macro
        // needs a literal. The two must stay the same.
        let plan: Vec<String> = sqlx::query_scalar(
            r#"EXPLAIN SELECT count(*) AS "count!"
           FROM accounts
           WHERE created_by_client_id = $1
             AND created_at > statement_timestamp() - make_interval(secs => $2)"#,
        )
        .bind(CLIENT)
        .bind(WINDOW.as_secs_f64())
        .fetch_all(&mut *tx)
        .await
        .unwrap();
        let plan = plan.join("\n");

        assert!(
            plan.contains("Index Scan using accounts_created_by_client_id_created_at_idx")
                || plan
                    .contains("Index Only Scan using accounts_created_by_client_id_created_at_idx"),
            "{plan}"
        );
        let condition = plan
            .lines()
            .find(|line| line.contains("Index Cond"))
            .unwrap_or_else(|| panic!("no index condition: {plan}"));
        assert!(condition.contains("created_by_client_id"), "{plan}");
        assert!(condition.contains("created_at"), "{plan}");
        assert!(
            !plan.contains("Filter"),
            "nothing is filtered after the scan: {plan}"
        );
    }

    #[sqlx::test]
    async fn get_returns_the_created_account(pool: PgPool) {
        let repository = AccountRepository::new(pool);
        let created = repository
            .create(NewAccount::full(display_name("Grace")))
            .await
            .unwrap();

        let found = repository.get(created.id).await.unwrap();

        assert_eq!(found, Some(created));
    }

    #[sqlx::test]
    async fn get_returns_none_for_an_unknown_id(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let found = repository.get(Uuid::new_v4()).await.unwrap();

        assert_eq!(found, None);
    }

    #[sqlx::test]
    async fn creates_an_account_with_a_caller_chosen_id(pool: PgPool) {
        let repository = AccountRepository::new(pool);
        let id = Uuid::new_v4();

        let account = repository
            .create(NewAccount::full(display_name("Ada")).with_id(id))
            .await
            .unwrap();

        assert_eq!(account.id, id);
    }

    /// The table has no CHECK, so nothing stops a row written outside CAS from
    /// holding a name with a bidi override in it. The reader is the guarantee:
    /// such a row fails to decode instead of reaching a UI.
    #[sqlx::test]
    async fn get_fails_to_decode_an_invalid_display_name(pool: PgPool) {
        let repository = AccountRepository::new(pool.clone());
        for invalid_name in ["\u{202e}adA", "\u{034f}", "\u{fe0f}", "\u{3164}"] {
            let id = Uuid::new_v4();
            // Unchecked query: see docs/TESTS.md.
            sqlx::query("INSERT INTO accounts (id, display_name, type) VALUES ($1, $2, 'full')")
                .bind(id)
                .bind(invalid_name)
                .execute(&pool)
                .await
                .unwrap();

            let error = repository.get(id).await.unwrap_err();

            assert!(
                matches!(error, sqlx::Error::ColumnDecode { .. }),
                "expected a column decode error for {invalid_name:?}, got {error:?}"
            );
        }
    }

    #[sqlx::test]
    async fn set_email_writes_the_address_and_none_clears_it(pool: PgPool) {
        let repository = AccountRepository::new(pool.clone());
        let account = repository
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let email = Email::try_new("ada@example.com").unwrap();

        assert!(set_email(&pool, account.id, Some(&email)).await.unwrap());
        let stored = repository.get(account.id).await.unwrap().unwrap();
        assert_eq!(stored.email.as_deref(), Some("ada@example.com"));

        assert!(set_email(&pool, account.id, None).await.unwrap());
        let stored = repository.get(account.id).await.unwrap().unwrap();
        assert_eq!(stored.email, None);
    }

    #[sqlx::test]
    async fn set_email_reports_an_unknown_account(pool: PgPool) {
        let email = Email::try_new("ada@example.com").unwrap();

        assert!(
            !set_email(&pool, Uuid::new_v4(), Some(&email))
                .await
                .unwrap()
        );
    }

    /// The column is not unique in v1 (the migration says why): two accounts
    /// may hold the same unverified address.
    #[sqlx::test]
    async fn emails_are_not_unique(pool: PgPool) {
        let repository = AccountRepository::new(pool.clone());
        let email = Email::try_new("ada@example.com").unwrap();

        for _ in 0..2 {
            let account = repository
                .create(NewAccount::full(display_name("Ada")))
                .await
                .unwrap();
            assert!(set_email(&pool, account.id, Some(&email)).await.unwrap());
        }
    }

    /// v1 has no username: two accounts may share a display name.
    #[sqlx::test]
    async fn display_names_are_not_unique(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let first = repository
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let second = repository
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();

        assert_ne!(first.id, second.id);
    }
}
