//! Clients — the applications allowed to start an authorization flow.
//!
//! A client is a row in `clients`: an id an operator picked, what it is
//! allowed to ask for, and — for a confidential client — the SHA-256 of a
//! secret CAS drew once. The registry has no HTTP surface of its own;
//! `/authorize` and `/token` read it and own their own error mapping. Until
//! the admin panel exists, rows are written by the `cas-client` binary
//! through [`registration::register`]. See
//! `docs/adr/0008-oidc-clients-registry.md`.
//!
//! This module is the vocabulary: the row and the rules it answers with. The
//! newtypes are the files beside it, the SQL is `repository`, the one use
//! case is [`registration`].

mod audience;
mod client_id;
mod client_name;
mod redirect_uri;
pub mod registration;
mod repository;
mod scope;
mod secret;

use time::OffsetDateTime;

pub use audience::Audience;
pub use client_id::{ClientId, ClientIdError, MAX_CLIENT_ID_LENGTH};
pub use client_name::{ClientName, ClientNameError};
pub use redirect_uri::{RedirectUri, RedirectUriError};
pub use registration::{RegisterError, Registered, Registration};
pub use repository::{ClientRepository, InsertError};
pub use scope::{Scope, ScopeError};
pub use secret::{ClientSecret, SecretHash};

/// The scope every client may request unless registration says otherwise:
/// without it a request is not an OpenID Connect request at all.
pub const DEFAULT_SCOPE: &str = "openid";

/// Whether a client can keep a secret.
///
/// Maps to the Postgres `client_kind` enum, like `AccountType` does to
/// `account_type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, serde::Serialize, serde::Deserialize)]
#[sqlx(type_name = "client_kind", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ClientKind {
    /// A browser or native application: the code ships to the user, so it
    /// holds no secret and authenticates with PKCE alone.
    Public,
    /// A server-side application: it authenticates at `/token` with a secret
    /// only it and CAS know.
    Confidential,
}

impl ClientKind {
    /// The stable word: what the CLI accepts, what the enum stores, what a
    /// log line says. Not the `Debug` of a Rust type, which is free to change
    /// when the type does.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Confidential => "confidential",
        }
    }
}

/// Why a string does not name a [`ClientKind`].
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("must be 'public' or 'confidential'")]
pub struct ClientKindError;

impl std::str::FromStr for ClientKind {
    type Err = ClientKindError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "public" => Ok(Self::Public),
            "confidential" => Ok(Self::Confidential),
            _ => Err(ClientKindError),
        }
    }
}

/// A row of `clients`.
///
/// Every string field is a validated newtype: the values are decoded from the
/// table, and a row written or altered outside CAS that does not pass
/// surfaces as a decode error instead of reaching an authorization decision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Client {
    /// The OIDC `client_id`, and the primary key.
    pub id: ClientId,
    /// What a consent screen shows for this client.
    pub name: ClientName,
    pub kind: ClientKind,
    /// `Some` for exactly the confidential clients — a CHECK constraint says
    /// so — and never the secret itself.
    pub secret_hash: Option<SecretHash>,
    /// Non-empty: registration refuses a client with nowhere to redirect.
    pub redirect_uris: Vec<RedirectUri>,
    /// Where RP-initiated logout may return the browser. May be empty.
    pub post_logout_redirect_uris: Vec<RedirectUri>,
    /// A first-party client skips the consent screen.
    pub first_party: bool,
    /// Whether this client may mint guest accounts through the guest grant.
    pub guest_login_allowed: bool,
    /// The allow-list of scopes this client may request.
    pub scopes: Vec<Scope>,
    /// The `aud` of the access tokens `/token` issues to this client.
    pub audience: Audience,
    pub created_at: OffsetDateTime,
}

impl Client {
    /// Whether `presented` is this client's secret. Always `false` for a
    /// public client: it has no secret, so nothing can be the right one.
    pub fn verify_secret(&self, presented: &str) -> bool {
        self.secret_hash
            .as_ref()
            .is_some_and(|hash| hash.verify(presented))
    }

    /// Whether `candidate` is one of the registered redirect URIs, compared
    /// as a string, byte for byte (OAuth 2.1 §4.1.3, RFC 6749 §3.1.2.3).
    /// Nothing is parsed, normalised or case-folded: every relaxation of this
    /// rule — a prefix match, a tolerated trailing slash, a wildcard host —
    /// is a known class of open redirect.
    pub fn allows_redirect_uri(&self, candidate: &str) -> bool {
        contains(&self.redirect_uris, candidate)
    }

    /// The same rule for the URI RP-initiated logout may return to.
    pub fn allows_post_logout_redirect_uri(&self, candidate: &str) -> bool {
        contains(&self.post_logout_redirect_uris, candidate)
    }

    /// Whether `scope` is one this client may request. Exact membership: a
    /// scope is a token, not a prefix.
    pub fn allows_scope(&self, scope: &str) -> bool {
        self.scopes.iter().any(|allowed| allowed.as_str() == scope)
    }
}

fn contains(registered: &[RedirectUri], candidate: &str) -> bool {
    registered.iter().any(|uri| uri.as_str() == candidate)
}

/// Why a set of values is not a [`NewClient`].
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum NewClientError {
    #[error("a client needs at least one redirect URI")]
    NoRedirectUris,
}

/// The values a caller supplies when registering a client. `created_at` is
/// assigned by the database.
///
/// The two constructors are what makes the secret invariant unrepresentable:
/// a public client cannot be given a hash, and a confidential one cannot be
/// built without one. `Debug` is derived — the struct holds the hash, never
/// the secret.
#[derive(Debug, Clone)]
pub struct NewClient {
    pub(crate) id: ClientId,
    pub(crate) name: ClientName,
    pub(crate) kind: ClientKind,
    pub(crate) secret_hash: Option<SecretHash>,
    pub(crate) redirect_uris: Vec<RedirectUri>,
    pub(crate) post_logout_redirect_uris: Vec<RedirectUri>,
    pub(crate) first_party: bool,
    pub(crate) guest_login_allowed: bool,
    pub(crate) scopes: Vec<Scope>,
    pub(crate) audience: Audience,
}

impl NewClient {
    /// A public client: no secret, PKCE alone at `/token`.
    pub fn public(
        id: ClientId,
        name: ClientName,
        redirect_uris: Vec<RedirectUri>,
    ) -> Result<Self, NewClientError> {
        Self::new(id, name, ClientKind::Public, None, redirect_uris)
    }

    /// A confidential client, identified at `/token` by the secret whose hash
    /// this is. The secret itself never reaches this type.
    pub fn confidential(
        id: ClientId,
        name: ClientName,
        secret_hash: SecretHash,
        redirect_uris: Vec<RedirectUri>,
    ) -> Result<Self, NewClientError> {
        Self::new(
            id,
            name,
            ClientKind::Confidential,
            Some(secret_hash),
            redirect_uris,
        )
    }

    fn new(
        id: ClientId,
        name: ClientName,
        kind: ClientKind,
        secret_hash: Option<SecretHash>,
        redirect_uris: Vec<RedirectUri>,
    ) -> Result<Self, NewClientError> {
        if redirect_uris.is_empty() {
            return Err(NewClientError::NoRedirectUris);
        }

        Ok(Self {
            audience: Audience::from(&id),
            id,
            name,
            kind,
            secret_hash,
            redirect_uris,
            post_logout_redirect_uris: Vec::new(),
            first_party: false,
            guest_login_allowed: false,
            scopes: vec![default_scope()],
        })
    }

    #[must_use]
    pub fn with_post_logout_redirect_uris(mut self, uris: Vec<RedirectUri>) -> Self {
        self.post_logout_redirect_uris = uris;
        self
    }

    #[must_use]
    pub fn first_party(mut self, first_party: bool) -> Self {
        self.first_party = first_party;
        self
    }

    #[must_use]
    pub fn guest_login_allowed(mut self, allowed: bool) -> Self {
        self.guest_login_allowed = allowed;
        self
    }

    /// Replaces the default allow-list. An empty list is allowed by the type
    /// and means "this client may request nothing", which `/authorize` will
    /// refuse; the CLI never produces one.
    #[must_use]
    pub fn with_scopes(mut self, scopes: Vec<Scope>) -> Self {
        self.scopes = scopes;
        self
    }

    /// Replaces the default audience, the client's own id, for a client
    /// whose access tokens are meant for a resource server it shares.
    #[must_use]
    pub fn with_audience(mut self, audience: Audience) -> Self {
        self.audience = audience;
        self
    }
}

/// [`DEFAULT_SCOPE`] as a [`Scope`]. The constant is a valid scope token, so
/// the construction cannot fail.
pub(crate) fn default_scope() -> Scope {
    Scope::try_new(DEFAULT_SCOPE).expect("the default scope is a valid scope token")
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn client_id(value: &str) -> ClientId {
        ClientId::try_new(value).unwrap()
    }

    pub(super) fn client_name(value: &str) -> ClientName {
        ClientName::try_new(value).unwrap()
    }

    pub(super) fn redirect_uri(value: &str) -> RedirectUri {
        RedirectUri::try_new(value).unwrap()
    }

    pub(super) fn scope(value: &str) -> Scope {
        Scope::try_new(value).unwrap()
    }

    /// A stored client, built without a database.
    fn client(kind: ClientKind, secret_hash: Option<SecretHash>) -> Client {
        Client {
            id: client_id("ligretto"),
            name: client_name("Ligretto"),
            kind,
            secret_hash,
            redirect_uris: vec![redirect_uri("https://app.example/cb")],
            post_logout_redirect_uris: vec![redirect_uri("https://app.example/")],
            first_party: true,
            guest_login_allowed: false,
            scopes: vec![scope("openid"), scope("profile")],
            audience: Audience::try_new("ligretto").unwrap(),
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    fn confidential_client(secret: &ClientSecret) -> Client {
        client(ClientKind::Confidential, Some(secret.hash()))
    }

    #[test]
    fn a_confidential_client_verifies_its_own_secret_only() {
        let secret = ClientSecret::generate().unwrap();
        let client = confidential_client(&secret);

        assert!(client.verify_secret(secret.expose()));
        assert!(!client.verify_secret(""));
        assert!(!client.verify_secret("wrong"));
        assert!(!client.verify_secret(ClientSecret::generate().unwrap().expose()));
    }

    /// A public client holds no secret, so no presented value can be right.
    #[test]
    fn a_public_client_verifies_nothing() {
        let secret = ClientSecret::generate().unwrap();
        let client = client(ClientKind::Public, None);

        assert!(!client.verify_secret(secret.expose()));
        assert!(!client.verify_secret(""));
    }

    #[test]
    fn a_redirect_uri_matches_exactly() {
        let client = client(ClientKind::Public, None);

        assert!(client.allows_redirect_uri("https://app.example/cb"));
        for candidate in [
            "https://app.example/cb/extra",
            "https://app.example/cb/",
            "https://app.example/c",
            "https://APP.example/cb",
            "https://app.example/CB",
            "https://app.example/cb?x=1",
            "https://app.example/cb#x",
            "http://app.example/cb",
            " https://app.example/cb",
            "",
        ] {
            assert!(
                !client.allows_redirect_uri(candidate),
                "{candidate:?} must not match"
            );
        }
    }

    #[test]
    fn a_post_logout_redirect_uri_matches_exactly() {
        let client = client(ClientKind::Public, None);

        assert!(client.allows_post_logout_redirect_uri("https://app.example/"));
        // The registered redirect URI is not a registered logout URI.
        assert!(!client.allows_post_logout_redirect_uri("https://app.example/cb"));
        assert!(!client.allows_post_logout_redirect_uri("https://app.example"));
    }

    /// A client with no registered logout URI allows none.
    #[test]
    fn no_post_logout_redirect_uri_allows_nothing() {
        let mut client = client(ClientKind::Public, None);
        client.post_logout_redirect_uris.clear();

        assert!(!client.allows_post_logout_redirect_uri("https://app.example/"));
    }

    #[test]
    fn a_scope_matches_exactly() {
        let client = client(ClientKind::Public, None);

        assert!(client.allows_scope("openid"));
        assert!(client.allows_scope("profile"));
        for candidate in ["email", "open", "openid profile", "OPENID", ""] {
            assert!(
                !client.allows_scope(candidate),
                "{candidate:?} must not match"
            );
        }
    }

    #[test]
    fn a_client_needs_at_least_one_redirect_uri() {
        assert_eq!(
            NewClient::public(client_id("ligretto"), client_name("Ligretto"), vec![]).unwrap_err(),
            NewClientError::NoRedirectUris
        );
        assert_eq!(
            NewClient::confidential(
                client_id("ligretto"),
                client_name("Ligretto"),
                ClientSecret::generate().unwrap().hash(),
                vec![],
            )
            .unwrap_err(),
            NewClientError::NoRedirectUris
        );
    }

    #[test]
    fn the_constructors_set_the_kind_and_the_defaults() {
        let public = NewClient::public(
            client_id("ligretto"),
            client_name("Ligretto"),
            vec![redirect_uri("https://app.example/cb")],
        )
        .unwrap();

        assert_eq!(public.kind, ClientKind::Public);
        assert_eq!(public.secret_hash, None);
        assert_eq!(public.scopes, vec![scope("openid")]);
        assert!(public.post_logout_redirect_uris.is_empty());
        assert!(!public.first_party);
        assert!(!public.guest_login_allowed);
        assert_eq!(public.audience.as_str(), "ligretto", "its own id");

        let secret = ClientSecret::generate().unwrap();
        let confidential = NewClient::confidential(
            client_id("ligretto"),
            client_name("Ligretto"),
            secret.hash(),
            vec![redirect_uri("https://app.example/cb")],
        )
        .unwrap();

        assert_eq!(confidential.kind, ClientKind::Confidential);
        assert_eq!(confidential.secret_hash, Some(secret.hash()));
    }

    #[test]
    fn the_builders_replace_the_defaults() {
        let new_client = NewClient::public(
            client_id("ligretto"),
            client_name("Ligretto"),
            vec![redirect_uri("https://app.example/cb")],
        )
        .unwrap()
        .with_post_logout_redirect_uris(vec![redirect_uri("https://app.example/")])
        .first_party(true)
        .guest_login_allowed(true)
        .with_scopes(vec![scope("openid"), scope("email")])
        .with_audience(Audience::try_new("games").unwrap());

        assert_eq!(
            new_client.post_logout_redirect_uris,
            vec![redirect_uri("https://app.example/")]
        );
        assert!(new_client.first_party);
        assert!(new_client.guest_login_allowed);
        assert_eq!(new_client.scopes, vec![scope("openid"), scope("email")]);
        assert_eq!(new_client.audience.as_str(), "games");
    }

    #[test]
    fn a_kind_round_trips_through_its_word() {
        for kind in [ClientKind::Public, ClientKind::Confidential] {
            assert_eq!(kind.as_str().parse(), Ok(kind));
        }
        assert_eq!("".parse::<ClientKind>(), Err(ClientKindError));
        assert_eq!("Public".parse::<ClientKind>(), Err(ClientKindError));
        assert_eq!("other".parse::<ClientKind>(), Err(ClientKindError));
    }

    /// `Debug` on the insert type must not print a secret; it holds none.
    #[test]
    fn debug_of_a_new_client_holds_no_secret() {
        let secret = ClientSecret::generate().unwrap();
        let new_client = NewClient::confidential(
            client_id("ligretto"),
            client_name("Ligretto"),
            secret.hash(),
            vec![redirect_uri("https://app.example/cb")],
        )
        .unwrap();

        assert!(!format!("{new_client:?}").contains(secret.expose()));
    }
}
