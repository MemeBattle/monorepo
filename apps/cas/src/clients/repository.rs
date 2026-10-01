//! Data access for `clients`.

use sqlx::PgPool;
use thiserror::Error;
use time::OffsetDateTime;

use super::{
    Audience, Client, ClientId, ClientKind, ClientName, NewClient, RedirectUri, Scope, SecretHash,
};

// `nutype` cannot derive the sqlx traits, so the ones that let a `ClientId`
// and a `ClientName` cross the database boundary are written by hand here,
// next to the queries that use them. `RedirectUri` and `Scope` live in
// `text[]` columns and are converted element by element in the row mapping
// below, which is why they need no impls of their own — and no
// `PgHasArrayType`. `Audience` is converted in the same mapping, like a
// single element: one column read by one query shape needs no impls either.

/// A `ClientId` is a Postgres text value, exactly like the `String` it wraps.
impl sqlx::Type<sqlx::Postgres> for ClientId {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        <String as sqlx::Type<sqlx::Postgres>>::type_info()
    }

    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        <String as sqlx::Type<sqlx::Postgres>>::compatible(ty)
    }
}

/// Re-validates on the way out of the database: a row whose id does not pass
/// fails to decode instead of becoming an unchecked `ClientId`.
impl<'r> sqlx::Decode<'r, sqlx::Postgres> for ClientId {
    fn decode(value: sqlx::postgres::PgValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let value = <String as sqlx::Decode<'r, sqlx::Postgres>>::decode(value)?;
        Self::try_new(value).map_err(Into::into)
    }
}

/// Lets a query bind the newtype directly, without unwrapping it first.
impl sqlx::Encode<'_, sqlx::Postgres> for ClientId {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
        let value: &str = self.as_ref();
        <&str as sqlx::Encode<'_, sqlx::Postgres>>::encode_by_ref(&value, buf)
    }
}

/// A `ClientName` is a Postgres text value, exactly like the `String` it
/// wraps.
impl sqlx::Type<sqlx::Postgres> for ClientName {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        <String as sqlx::Type<sqlx::Postgres>>::type_info()
    }

    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        <String as sqlx::Type<sqlx::Postgres>>::compatible(ty)
    }
}

/// Re-validates on the way out, as for a display name: a name that no longer
/// passes the label rules never reaches a consent screen.
impl<'r> sqlx::Decode<'r, sqlx::Postgres> for ClientName {
    fn decode(value: sqlx::postgres::PgValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let value = <String as sqlx::Decode<'r, sqlx::Postgres>>::decode(value)?;
        Self::try_new(value).map_err(Into::into)
    }
}

impl sqlx::Encode<'_, sqlx::Postgres> for ClientName {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
        let value: &str = self.as_ref();
        <&str as sqlx::Encode<'_, sqlx::Postgres>>::encode_by_ref(&value, buf)
    }
}

/// Name Postgres gives the primary key constraint on `clients.id`.
const CLIENTS_PKEY: &str = "clients_pkey";

/// Why an insert did not produce a row.
#[derive(Debug, Error)]
pub enum InsertError {
    /// The id is taken. There is no update path yet (the admin panel owns
    /// it), so a mistake is fixed by registering another id.
    #[error("a client with this id already exists")]
    AlreadyExists,

    #[error(transparent)]
    Db(sqlx::Error),
}

/// The constraint name is the database's way of saying "already registered";
/// only the queries here know it, so the mapping lives next to them.
impl From<sqlx::Error> for InsertError {
    fn from(error: sqlx::Error) -> Self {
        match &error {
            sqlx::Error::Database(db)
                if db.is_unique_violation() && db.constraint() == Some(CLIENTS_PKEY) =>
            {
                Self::AlreadyExists
            }
            _ => Self::Db(error),
        }
    }
}

/// The row as the queries return it: the `text[]` columns and the audience
/// still as strings, the hash still as bytes.
struct ClientRow {
    id: ClientId,
    name: ClientName,
    kind: ClientKind,
    secret_hash: Option<Vec<u8>>,
    redirect_uris: Vec<String>,
    post_logout_redirect_uris: Vec<String>,
    first_party: bool,
    guest_login_allowed: bool,
    scopes: Vec<String>,
    audience: String,
    created_at: OffsetDateTime,
}

/// Turns the stored strings into the domain's newtypes. A value the table
/// holds but the domain refuses — nothing writes one through CAS, but the
/// table has no CHECK for it — becomes a decode error rather than a client
/// an authorization decision is made against.
fn to_client(row: ClientRow) -> Result<Client, sqlx::Error> {
    Ok(Client {
        id: row.id,
        name: row.name,
        kind: row.kind,
        secret_hash: row.secret_hash.map(SecretHash::from_bytes),
        redirect_uris: redirect_uris(row.redirect_uris, "redirect_uris")?,
        post_logout_redirect_uris: redirect_uris(
            row.post_logout_redirect_uris,
            "post_logout_redirect_uris",
        )?,
        first_party: row.first_party,
        guest_login_allowed: row.guest_login_allowed,
        scopes: scopes(row.scopes)?,
        audience: Audience::try_new(row.audience)
            .map_err(|error| column_decode("audience", error))?,
        created_at: row.created_at,
    })
}

fn redirect_uris(values: Vec<String>, column: &str) -> Result<Vec<RedirectUri>, sqlx::Error> {
    values
        .into_iter()
        .map(|value| RedirectUri::try_new(value).map_err(|error| column_decode(column, error)))
        .collect()
}

fn scopes(values: Vec<String>) -> Result<Vec<Scope>, sqlx::Error> {
    values
        .into_iter()
        .map(|value| Scope::try_new(value).map_err(|error| column_decode("scopes", error)))
        .collect()
}

fn column_decode<E>(column: &str, error: E) -> sqlx::Error
where
    E: std::error::Error + Send + Sync + 'static,
{
    sqlx::Error::ColumnDecode {
        index: column.to_owned(),
        source: Box::new(error),
    }
}

/// Inserts a client with any executor and returns the stored row, including
/// the database-assigned `created_at`.
pub(crate) async fn insert<'e, E>(executor: E, client: NewClient) -> Result<Client, InsertError>
where
    E: sqlx::PgExecutor<'e>,
{
    // `as _` on the newtypes: the macro infers `&str` for a text parameter,
    // so the cast is what makes it use the `Encode` impl for the newtype.
    // The two arrays are bound as plain `Vec<String>`; the newtypes are only
    // the guarantee that every element was valid when it was written.
    let redirect_uris: Vec<String> = client.redirect_uris.into_iter().map(Into::into).collect();
    let post_logout_redirect_uris: Vec<String> = client
        .post_logout_redirect_uris
        .into_iter()
        .map(Into::into)
        .collect();
    let scopes: Vec<String> = client.scopes.into_iter().map(Into::into).collect();
    let audience: String = client.audience.into();

    let row = sqlx::query_as!(
        ClientRow,
        r#"INSERT INTO clients (
               id, name, kind, secret_hash, redirect_uris,
               post_logout_redirect_uris, first_party, guest_login_allowed, scopes,
               audience
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING
               id AS "id: ClientId",
               name AS "name: ClientName",
               kind AS "kind: ClientKind",
               secret_hash,
               redirect_uris,
               post_logout_redirect_uris,
               first_party,
               guest_login_allowed,
               scopes,
               audience,
               created_at"#,
        client.id as _,
        client.name as _,
        client.kind as ClientKind,
        client.secret_hash.as_ref().map(AsRef::as_ref) as Option<&[u8]>,
        &redirect_uris,
        &post_logout_redirect_uris,
        client.first_party,
        client.guest_login_allowed,
        &scopes,
        audience,
    )
    .fetch_one(executor)
    .await?;

    to_client(row).map_err(InsertError::Db)
}

/// Looks a client up by id with any executor. `Ok(None)` means no such
/// client.
pub(crate) async fn get<'e, E>(executor: E, id: &ClientId) -> Result<Option<Client>, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let row = sqlx::query_as!(
        ClientRow,
        r#"SELECT
               id AS "id: ClientId",
               name AS "name: ClientName",
               kind AS "kind: ClientKind",
               secret_hash,
               redirect_uris,
               post_logout_redirect_uris,
               first_party,
               guest_login_allowed,
               scopes,
               audience,
               created_at
           FROM clients
           WHERE id = $1"#,
        id as _,
    )
    .fetch_optional(executor)
    .await?;

    row.map(to_client).transpose()
}

/// Data access for `clients`. Public so that `/authorize` and `/token` can
/// hold one, or a service over it, without this file changing shape.
#[derive(Debug, Clone)]
pub struct ClientRepository {
    pool: PgPool,
}

impl ClientRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Inserts a client and returns the stored row.
    pub async fn create(&self, client: NewClient) -> Result<Client, InsertError> {
        insert(&self.pool, client).await
    }

    /// Looks a client up by id. `Ok(None)` means no such client.
    pub async fn get(&self, id: &ClientId) -> Result<Option<Client>, sqlx::Error> {
        get(&self.pool, id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::ClientSecret;
    use crate::clients::tests::{client_id, client_name, redirect_uri, scope};

    fn confidential(secret: &ClientSecret) -> NewClient {
        NewClient::confidential(
            client_id("ligretto"),
            client_name("Ligretto"),
            secret.hash(),
            vec![
                redirect_uri("http://localhost:5173/oidc/callback"),
                redirect_uri("https://ligretto.example/oidc/callback"),
            ],
        )
        .unwrap()
        .with_post_logout_redirect_uris(vec![redirect_uri("http://localhost:5173/")])
        .first_party(true)
        .guest_login_allowed(true)
        .with_scopes(vec![scope("openid"), scope("profile"), scope("email")])
        .with_audience(Audience::try_new("games").unwrap())
    }

    fn public() -> NewClient {
        NewClient::public(
            client_id("cli"),
            client_name("CLI"),
            vec![redirect_uri("http://127.0.0.1:8080/cb")],
        )
        .unwrap()
    }

    #[sqlx::test]
    async fn create_then_get_round_trips_a_confidential_client(pool: PgPool) {
        let repository = ClientRepository::new(pool);
        let secret = ClientSecret::generate().unwrap();

        let created = repository.create(confidential(&secret)).await.unwrap();

        assert_eq!(created.id, client_id("ligretto"));
        assert_eq!(created.name, client_name("Ligretto"));
        assert_eq!(created.kind, ClientKind::Confidential);
        assert_eq!(created.secret_hash, Some(secret.hash()));
        assert_eq!(
            created.redirect_uris,
            vec![
                redirect_uri("http://localhost:5173/oidc/callback"),
                redirect_uri("https://ligretto.example/oidc/callback"),
            ]
        );
        assert_eq!(
            created.post_logout_redirect_uris,
            vec![redirect_uri("http://localhost:5173/")]
        );
        assert!(created.first_party);
        assert!(created.guest_login_allowed);
        assert_eq!(
            created.scopes,
            vec![scope("openid"), scope("profile"), scope("email")]
        );
        assert_eq!(created.audience.as_str(), "games");

        let found = repository.get(&client_id("ligretto")).await.unwrap();

        assert_eq!(found, Some(created));
    }

    #[sqlx::test]
    async fn create_then_get_round_trips_a_public_client(pool: PgPool) {
        let repository = ClientRepository::new(pool);

        let created = repository.create(public()).await.unwrap();

        assert_eq!(created.kind, ClientKind::Public);
        assert_eq!(created.secret_hash, None);
        // The defaults the constructor sets, as the database stored them.
        assert!(created.post_logout_redirect_uris.is_empty());
        assert!(!created.first_party);
        assert!(!created.guest_login_allowed);
        assert_eq!(created.scopes, vec![scope("openid")]);
        assert_eq!(created.audience.as_str(), "cli", "its own id");

        assert_eq!(
            repository.get(&client_id("cli")).await.unwrap(),
            Some(created)
        );
    }

    #[sqlx::test]
    async fn get_returns_none_for_an_unknown_id(pool: PgPool) {
        let repository = ClientRepository::new(pool);

        assert_eq!(repository.get(&client_id("nobody")).await.unwrap(), None);
    }

    #[sqlx::test]
    async fn create_refuses_a_duplicate_id(pool: PgPool) {
        let repository = ClientRepository::new(pool);
        repository.create(public()).await.unwrap();

        let error = repository.create(public()).await.unwrap_err();

        assert!(matches!(error, InsertError::AlreadyExists), "{error:?}");
    }

    /// The acceptance criterion, read straight from the table: the column
    /// holds the SHA-256 and nothing that resembles the secret.
    #[sqlx::test]
    async fn the_secret_is_stored_only_as_its_hash(pool: PgPool) {
        let repository = ClientRepository::new(pool.clone());
        let secret = ClientSecret::generate().unwrap();
        repository.create(confidential(&secret)).await.unwrap();

        // Unchecked query: see docs/TESTS.md.
        let stored: Vec<u8> = sqlx::query_scalar("SELECT secret_hash FROM clients WHERE id = $1")
            .bind("ligretto")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(stored, secret.hash().as_ref());
        assert_eq!(stored.len(), 32, "SHA-256");
        assert!(
            !String::from_utf8_lossy(&stored).contains(secret.expose()),
            "the clear secret must not be in the column"
        );

        let client = repository
            .get(&client_id("ligretto"))
            .await
            .unwrap()
            .unwrap();
        assert!(client.verify_secret(secret.expose()));
        assert!(!client.verify_secret("wrong"));
    }

    /// The CHECK constraint, not the domain: a row written outside CAS cannot
    /// hold a confidential client without a hash, or a public one with one.
    #[sqlx::test]
    async fn the_database_ties_the_hash_to_the_kind(pool: PgPool) {
        for (kind, hash) in [("confidential", None), ("public", Some(vec![0u8; 32]))] {
            // Unchecked query: see docs/TESTS.md.
            let error = sqlx::query(
                "INSERT INTO clients (id, name, kind, secret_hash, redirect_uris, scopes, audience)
                 VALUES ($1, 'X', $2::client_kind, $3, ARRAY['https://app.example/cb'], ARRAY['openid'], $1)",
            )
            .bind(format!("bad-{kind}"))
            .bind(kind)
            .bind(hash)
            .execute(&pool)
            .await
            .unwrap_err();

            let sqlx::Error::Database(db) = &error else {
                panic!("expected a database error, got {error:?}");
            };
            assert_eq!(db.constraint(), Some("clients_secret_hash_matches_kind"));
        }
    }

    /// The table has no CHECK on the URI strings, so the reader is the
    /// guarantee: a row altered outside CAS fails to decode instead of
    /// widening where a response may be sent. The lookup key stays valid; a
    /// different column is corrupted.
    #[sqlx::test]
    async fn a_bad_stored_redirect_uri_is_a_decode_error(pool: PgPool) {
        let repository = ClientRepository::new(pool.clone());

        // Unchecked queries: see docs/TESTS.md. One literal per column; the
        // column name cannot be interpolated into a query string.
        for (column, corrupt) in [
            (
                "redirect_uris",
                "UPDATE clients SET redirect_uris = ARRAY['not a uri'] WHERE id = $1",
            ),
            (
                "post_logout_redirect_uris",
                "UPDATE clients SET post_logout_redirect_uris = ARRAY['not a uri'] WHERE id = $1",
            ),
        ] {
            sqlx::query("DELETE FROM clients")
                .execute(&pool)
                .await
                .unwrap();
            repository.create(public()).await.unwrap();
            sqlx::query(corrupt)
                .bind("cli")
                .execute(&pool)
                .await
                .unwrap();

            let error = repository.get(&client_id("cli")).await.unwrap_err();

            assert!(
                matches!(error, sqlx::Error::ColumnDecode { ref index, .. } if index == column),
                "expected a decode error for {column}, got {error:?}"
            );
        }
    }

    #[sqlx::test]
    async fn a_bad_stored_scope_is_a_decode_error(pool: PgPool) {
        let repository = ClientRepository::new(pool.clone());
        repository.create(public()).await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE clients SET scopes = ARRAY['open id'] WHERE id = $1")
            .bind("cli")
            .execute(&pool)
            .await
            .unwrap();

        let error = repository.get(&client_id("cli")).await.unwrap_err();

        assert!(
            matches!(error, sqlx::Error::ColumnDecode { ref index, .. } if index == "scopes"),
            "{error:?}"
        );
    }

    #[sqlx::test]
    async fn a_bad_stored_audience_is_a_decode_error(pool: PgPool) {
        let repository = ClientRepository::new(pool.clone());
        repository.create(public()).await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE clients SET audience = 'Not A Slug' WHERE id = $1")
            .bind("cli")
            .execute(&pool)
            .await
            .unwrap();

        let error = repository.get(&client_id("cli")).await.unwrap_err();

        assert!(
            matches!(error, sqlx::Error::ColumnDecode { ref index, .. } if index == "audience"),
            "{error:?}"
        );
    }

    /// The same guard for the id. `get` cannot reach it — `ClientId::try_new`
    /// refuses the value before a query is sent — so the decode is exercised
    /// directly.
    #[sqlx::test]
    async fn a_bad_stored_id_is_a_decode_error(pool: PgPool) {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "INSERT INTO clients (id, name, kind, redirect_uris, scopes, audience)
             VALUES ('Bad', 'Bad', 'public', ARRAY['https://app.example/cb'], ARRAY['openid'], 'bad')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Unchecked query: see docs/TESTS.md.
        let error = sqlx::query_scalar::<_, ClientId>("SELECT id FROM clients WHERE id = $1")
            .bind("Bad")
            .fetch_one(&pool)
            .await
            .unwrap_err();

        assert!(
            matches!(error, sqlx::Error::ColumnDecode { .. }),
            "{error:?}"
        );
    }

    /// And for the name, under the label rules.
    #[sqlx::test]
    async fn a_bad_stored_name_is_a_decode_error(pool: PgPool) {
        let repository = ClientRepository::new(pool.clone());
        repository.create(public()).await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE clients SET name = $1 WHERE id = $2")
            .bind("\u{202e}ilc")
            .bind("cli")
            .execute(&pool)
            .await
            .unwrap();

        let error = repository.get(&client_id("cli")).await.unwrap_err();

        assert!(
            matches!(error, sqlx::Error::ColumnDecode { .. }),
            "{error:?}"
        );
    }
}
