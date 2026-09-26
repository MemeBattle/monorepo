//! Registering a client: the one use case of the context.
//!
//! It lives in the library rather than in `bin/client.rs` so that the binary
//! stays what every binary here is — load the config, call into the library,
//! nothing else — and so that a `#[sqlx::test]` can exercise the whole path
//! without starting a process. Until the admin panel exists (M6) this is the
//! only way a row reaches `clients`; a migration was deliberately not used,
//! because a migration runs everywhere and would carry a known secret into
//! production. See `docs/adr/0008-oidc-clients-registry.md`.

use sqlx::PgPool;
use thiserror::Error;

use super::{
    Client, ClientId, ClientKind, ClientName, ClientSecret, InsertError, NewClient, NewClientError,
    RedirectUri, Scope, default_scope, repository,
};

/// What an operator asked for. A confidential client's secret is not part of
/// it: CAS draws that itself, so a low-entropy secret cannot enter the table
/// through the supported path.
#[derive(Debug, Clone)]
pub struct Registration {
    pub id: ClientId,
    pub name: ClientName,
    pub kind: ClientKind,
    pub redirect_uris: Vec<RedirectUri>,
    pub post_logout_redirect_uris: Vec<RedirectUri>,
    pub first_party: bool,
    pub guest_login_allowed: bool,
    /// Empty means the default, `openid` alone.
    pub scopes: Vec<Scope>,
}

/// The registered client and, for a confidential one, the secret. This is the
/// only moment the secret exists outside the caller's hands: the table keeps
/// its hash, so it cannot be shown again.
#[derive(Debug)]
pub struct Registered {
    pub client: Client,
    pub secret: Option<ClientSecret>,
}

#[derive(Debug, Error)]
pub enum RegisterError {
    /// The id is taken. There is no update path yet, so the answer is another
    /// id or a fresh dev database.
    #[error("a client with the id {0} already exists")]
    AlreadyExists(ClientId),

    #[error(transparent)]
    NewClient(#[from] NewClientError),

    #[error("the operating system refused to provide randomness: {0}")]
    Random(#[from] getrandom::Error),

    #[error(transparent)]
    Db(sqlx::Error),
}

/// Registers a client and returns it, with the generated secret when the
/// client is confidential.
///
/// Logged at `info` with the id and the kind. The secret appears in no log:
/// it is written once, to the caller's stdout, by the binary.
pub async fn register(
    pool: &PgPool,
    registration: Registration,
) -> Result<Registered, RegisterError> {
    let id = registration.id.clone();
    let secret = match registration.kind {
        ClientKind::Public => None,
        ClientKind::Confidential => Some(ClientSecret::generate()?),
    };

    let new_client = match &secret {
        Some(secret) => NewClient::confidential(
            registration.id,
            registration.name,
            secret.hash(),
            registration.redirect_uris,
        ),
        None => NewClient::public(
            registration.id,
            registration.name,
            registration.redirect_uris,
        ),
    }?
    .with_post_logout_redirect_uris(registration.post_logout_redirect_uris)
    .first_party(registration.first_party)
    .guest_login_allowed(registration.guest_login_allowed)
    .with_scopes(if registration.scopes.is_empty() {
        vec![default_scope()]
    } else {
        registration.scopes
    });

    let client = repository::insert(pool, new_client)
        .await
        .map_err(|error| match error {
            InsertError::AlreadyExists => RegisterError::AlreadyExists(id),
            InsertError::Db(error) => RegisterError::Db(error),
        })?;

    tracing::info!(
        client_id = %client.id,
        kind = client.kind.as_str(),
        first_party = client.first_party,
        guest_login_allowed = client.guest_login_allowed,
        "client registered"
    );

    Ok(Registered { client, secret })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::ClientRepository;
    use crate::clients::tests::{client_id, client_name, redirect_uri, scope};
    use crate::testing::capture_tracing;

    fn registration(kind: ClientKind) -> Registration {
        Registration {
            id: client_id("ligretto"),
            name: client_name("Ligretto"),
            kind,
            redirect_uris: vec![redirect_uri("http://localhost:5173/oidc/callback")],
            post_logout_redirect_uris: vec![redirect_uri("http://localhost:5173/")],
            first_party: true,
            guest_login_allowed: true,
            scopes: vec![scope("openid"), scope("profile")],
        }
    }

    #[sqlx::test]
    async fn a_confidential_client_gets_a_secret_the_stored_row_verifies(pool: PgPool) {
        let registered = register(&pool, registration(ClientKind::Confidential))
            .await
            .unwrap();

        let secret = registered
            .secret
            .expect("a confidential client has a secret");
        let stored = ClientRepository::new(pool)
            .get(&client_id("ligretto"))
            .await
            .unwrap()
            .unwrap();

        assert_eq!(stored, registered.client);
        assert!(stored.verify_secret(secret.expose()));
        assert!(!stored.verify_secret("wrong"));
    }

    #[sqlx::test]
    async fn a_public_client_gets_no_secret(pool: PgPool) {
        let registered = register(&pool, registration(ClientKind::Public))
            .await
            .unwrap();

        assert!(registered.secret.is_none());
        assert_eq!(registered.client.secret_hash, None);
    }

    #[sqlx::test]
    async fn an_empty_scope_list_means_the_default(pool: PgPool) {
        let mut registration = registration(ClientKind::Public);
        registration.scopes = Vec::new();

        let registered = register(&pool, registration).await.unwrap();

        assert_eq!(registered.client.scopes, vec![scope("openid")]);
    }

    #[sqlx::test]
    async fn a_client_needs_at_least_one_redirect_uri(pool: PgPool) {
        let mut registration = registration(ClientKind::Public);
        registration.redirect_uris = Vec::new();

        let error = register(&pool, registration).await.unwrap_err();

        assert!(
            matches!(
                error,
                RegisterError::NewClient(NewClientError::NoRedirectUris)
            ),
            "{error:?}"
        );
    }

    #[sqlx::test]
    async fn registering_the_same_id_twice_is_refused(pool: PgPool) {
        register(&pool, registration(ClientKind::Public))
            .await
            .unwrap();

        let error = register(&pool, registration(ClientKind::Confidential))
            .await
            .unwrap_err();

        assert!(
            matches!(error, RegisterError::AlreadyExists(ref id) if id == &client_id("ligretto")),
            "{error:?}"
        );
    }

    /// The line names the client; the secret belongs to the operator's
    /// terminal and to nothing else.
    #[sqlx::test]
    async fn the_registration_is_logged_without_the_secret(pool: PgPool) {
        let (events, _guard) = capture_tracing();

        let registered = register(&pool, registration(ClientKind::Confidential))
            .await
            .unwrap();

        let secret = registered.secret.unwrap();
        let logged = events.mentioning("client registered");
        assert_eq!(logged.len(), 1, "{:?}", events.all());
        assert!(logged[0].contains("ligretto"), "{}", logged[0]);
        assert!(logged[0].contains("confidential"), "{}", logged[0]);
        for event in events.all() {
            assert!(
                !event.contains(secret.expose()),
                "the secret must never be logged: {event}"
            );
        }
    }
}
