//! Starting and finishing a provider flow: the two intents, and where the
//! connection boundaries are.
//!
//! [`IdentityService::start`] writes the flow row and answers with the
//! provider's authorization URL plus the one-time secret for the browser's
//! cookie. [`IdentityService::finish`] is the callback's, and it runs in
//! three phases that never overlap on the database: the flow is consumed by
//! one auto-committed statement, then the request is validated with no
//! connection held, then the provider is asked, then — and only then — the
//! write happens. On a Worker a request holds exactly one connection and a
//! nested acquire fails at once ([`crate::db::Db::acquire`]), so a phase
//! gives its connection back before the next one, and session issuance is
//! delegated to [`SessionService`], which acquires for itself.
//!
//! The flow is consumed *before* the exchange, by design: a replay must find
//! nothing even while the first exchange is in flight. The price is that a
//! provider hiccup costs the person a restart (ADR 0023 (c)).

use sqlx::Connection;
use subtle::ConstantTimeEq;
use thiserror::Error;
use url::Url;
use uuid::Uuid;

use super::provider::{ExchangeError, NormalizedIdentity, PkceVerifier, Provider, Providers};
use super::{
    FALLBACK_DISPLAY_NAME, FlowSecret, Intent, LinkError, MAX_PROVIDER_SUBJECT_LENGTH,
    ProfileSnapshot, ProviderId, repository,
};
use crate::accounts::{self, DisplayName, NewAccount};
use crate::db::Db;
use crate::oidc::authorization::{MAX_NONCE_LENGTH, MAX_STATE_LENGTH};
use crate::sessions::SessionOrigin;
use crate::sessions::service::{CreateError, IssuedSession, SessionService};

/// Upper bound on a `return_to`, in characters of the value as it travels.
///
/// The longest one CAS produces is an `/oidc/authorize` continuation: that
/// endpoint hands an anonymous browser to the frontend with the whole
/// authorization request as `return_to`
/// ([`crate::oidc::http::authorize`]), byte for byte as the browser sent it,
/// so the request's parameters are still percent-encoded. What
/// `/oidc/authorize` bounds is the other form: [`MAX_STATE_LENGTH`] and
/// [`MAX_NONCE_LENGTH`] cap `state` and `nonce` *decoded*, in bytes. Since
/// percent-encoding costs at most three characters per byte, three times
/// those two is what the continuation can carry of them however the client
/// writes them, and 1024 characters on top is the allowance for the rest of
/// the request as sent — the client id, the redirect URI, the scopes, the
/// PKCE challenge.
///
/// That allowance is the contract, not a promise about every request
/// `/oidc/authorize` accepts. The endpoint judges only the parameters it
/// reads, so the remainder of a request is not bounded anywhere: parameters
/// outside that set, or an extraordinarily long registered redirect URI, can
/// push a continuation past 4096 characters. Such a request authorizes
/// normally, and starting external sign-in from its continuation is refused
/// with `invalid_return_to` — deliberately, because 1024 characters covers
/// every registered client with wide margin, while the value an anonymous
/// request writes into a flow row and a redirect's `Location` echoes has to
/// stay bounded.
pub const MAX_RETURN_TO_LENGTH: usize = 3 * (MAX_STATE_LENGTH + MAX_NONCE_LENGTH) + 1024;

/// Where the browser goes when nothing was asked for.
pub const DEFAULT_RETURN_TO: &str = "/";

/// Why a flow could not be started.
#[derive(Debug, Error)]
pub enum StartError {
    /// No provider is registered under that slug — including a slug that is
    /// not a [`ProviderId`] at all, which no deployment can serve either.
    #[error("no such identity provider")]
    UnknownProvider,

    #[error("returnTo must be a path on this site, such as /dashboard")]
    InvalidReturnTo,

    /// The operating system refused to provide randomness. Nothing a request
    /// can do about it.
    #[error("failed to generate flow secrets: {0}")]
    Random(#[source] getrandom::Error),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// What the browser needs to leave for the provider: where to go, and the
/// secret that proves on the way back that this browser is the one that
/// started the flow.
#[derive(Debug)]
pub struct StartedFlow {
    pub url: Url,
    pub secret: FlowSecret,
}

/// What the provider sent the callback. Either half is the provider's
/// answer, and both consume the flow: a refusal is still an answer, and the
/// `state` it carries must not survive to be answered again.
#[derive(Debug)]
pub enum Callback {
    /// The authorization code to exchange.
    Code(String),
    /// The provider refused — the person declined, or the provider would not
    /// authorize this request.
    Denied,
}

/// What finishing a flow produced.
#[derive(Debug)]
pub enum Finished {
    /// A `sign_in` flow: the account was found or created, and a session is
    /// issued for it.
    SignedIn {
        session: IssuedSession,
        return_to: String,
    },
    /// A `link` flow: the identity is on the account the flow was started
    /// for. No session is issued — the browser already had one.
    Linked {
        identity_id: Uuid,
        return_to: String,
    },
}

impl Finished {
    /// Where the browser goes next, whichever intent ran.
    pub fn return_to(&self) -> &str {
        match self {
            Self::SignedIn { return_to, .. } | Self::Linked { return_to, .. } => return_to,
        }
    }
}

/// Why a callback did not finish its flow.
///
/// Most of them leave the flow consumed: the row was taken before any of
/// that could fail. Two do not always, which is why no answer reads the
/// right to clear the flow cookie off the variant: [`Self::FlowNotFound`]
/// consumed nothing when the `state` named no live flow, though it did
/// consume a row when the flow was another provider's, and [`Self::Db`] can
/// be the take itself. What decides whether the cookie goes out cleared is
/// the predicate [`crate::identities::http`] keys on (ADR 0023 (d)): the
/// presented cookie was matched against the row this request consumed.
#[derive(Debug, Error)]
pub enum FinishError {
    /// The `state` names no live flow: unknown, expired, already used, or
    /// minted for another provider. One error for all of them, because the
    /// remedy is the same and a caller learns nothing about which flows
    /// exist.
    #[error("the sign-in attempt is unknown or has expired")]
    FlowNotFound,

    /// The flow cookie is missing or names another flow: this browser is not
    /// the one that started it (ADR 0023 (d)).
    #[error("this sign-in attempt was not started in this browser")]
    ForeignFlow,

    /// The provider refused the request.
    #[error("the provider did not authorize the request")]
    ProviderDenied,

    /// A `link` flow finished without a session naming the account it was
    /// started for.
    #[error("the session does not belong to the account this link was started for")]
    SessionMismatch,

    /// The identity is already on an account, so it cannot be linked to
    /// another.
    #[error("this identity is already linked to an account")]
    AlreadyLinked,

    #[error(transparent)]
    Exchange(#[from] ExchangeError),

    /// Another request claimed the identity and then gave it up again. The
    /// person's remedy is to start the flow once more.
    #[error("the sign-in lost a race; try again")]
    Contended,

    /// The operating system refused to provide randomness, which is all
    /// [`CreateError::Random`] can be.
    #[error("failed to generate a session token: {0}")]
    Random(#[source] getrandom::Error),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl From<CreateError> for FinishError {
    fn from(error: CreateError) -> Self {
        match error {
            CreateError::Random(error) => Self::Random(error),
            CreateError::Db(error) => Self::Db(error),
        }
    }
}

impl From<LinkError> for FinishError {
    fn from(error: LinkError) -> Self {
        match error {
            LinkError::AlreadyLinked => Self::AlreadyLinked,
            LinkError::Db(error) => Self::Db(error),
        }
    }
}

/// Signing in with, and linking, external identities.
#[derive(Debug, Clone)]
pub struct IdentityService {
    db: Db,
    providers: Providers,
    /// Session issuance is delegated, not done here: the delegate acquires
    /// its own connection, so this service must hold none when it calls
    /// (ADR 0021).
    sessions: SessionService,
    /// The API's public base URL (`CAS_ISSUER`), from which the callback's
    /// absolute address is built: that address is what a provider registers,
    /// so it must be the one CAS announces, not the one a request arrived on.
    issuer: String,
}

impl IdentityService {
    pub fn new(
        db: impl Into<Db>,
        providers: Providers,
        sessions: SessionService,
        issuer: String,
    ) -> Self {
        Self {
            db: db.into(),
            providers,
            sessions,
            issuer,
        }
    }

    /// Starts a flow: resolves the provider, validates `return_to`, draws the
    /// PKCE pair and the browser secret, writes the flow row, and answers
    /// with the provider's authorization URL.
    ///
    /// `account_id` is the account a `link` flow is for, which the callback
    /// will hold the session to; `sign_in` has none.
    pub async fn start(
        &self,
        provider: &str,
        intent: Intent,
        account_id: Option<Uuid>,
        return_to: Option<&str>,
    ) -> Result<StartedFlow, StartError> {
        let provider = self.resolve(provider).ok_or(StartError::UnknownProvider)?;
        let return_to = validate_return_to(return_to)?;

        let verifier = PkceVerifier::generate().map_err(StartError::Random)?;
        let secret = FlowSecret::generate().map_err(StartError::Random)?;
        let redirect_uri = self.redirect_uri(&provider.id());

        // The first database work of the method, and the last: acquire here,
        // not above.
        let mut conn = self.db.acquire().await?;
        let state = repository::insert_flow(
            &mut *conn,
            &repository::NewFlow {
                provider: &provider.id(),
                intent,
                pkce_verifier: &verifier,
                browser_hash: secret.hash(),
                account_id,
                return_to: &return_to,
            },
        )
        .await?;
        drop(conn);

        tracing::debug!(
            flow_id = %state,
            provider = %provider.id(),
            intent = intent.as_str(),
            account_id = ?account_id,
            "identity flow started"
        );

        Ok(StartedFlow {
            url: provider.authorization_url(&redirect_uri, state, &verifier.challenge()),
            secret,
        })
    }

    /// Finishes the flow the provider sent the browser back with.
    ///
    /// `provider` is the slug in the callback's path, `state` the parameter
    /// the provider echoed, `secret` the value of the flow cookie if the
    /// request carried one, and `current_account` the account the request's
    /// session names, which a `link` flow is held to.
    pub async fn finish(
        &self,
        provider: &str,
        state: Uuid,
        callback: Callback,
        secret: Option<&str>,
        current_account: Option<Uuid>,
    ) -> Result<Finished, FinishError> {
        // Phase 1 — consume. One auto-committed statement, outside any
        // transaction, and the connection goes back before anything else
        // runs: from here on the `state` is spent whatever happens.
        let mut conn = self.db.acquire().await?;
        let flow = repository::take_flow(&mut conn, state)
            .await?
            .ok_or(FinishError::FlowNotFound)?;
        drop(conn);

        // Phase 2 — validate, with no connection held.
        let provider = self
            .matching_provider(provider, &flow.provider)
            .ok_or(FinishError::FlowNotFound)?;
        if !presented_secret_matches(secret, &flow.browser_hash) {
            tracing::warn!(
                flow_id = %state,
                provider = %flow.provider,
                "a callback presented no matching flow cookie"
            );
            return Err(FinishError::ForeignFlow);
        }
        let code = match callback {
            Callback::Code(code) => code,
            Callback::Denied => {
                tracing::debug!(
                    flow_id = %state,
                    provider = %flow.provider,
                    "the provider did not authorize the request"
                );
                return Err(FinishError::ProviderDenied);
            }
        };
        if flow.intent == Intent::Link && flow.account_id != current_account {
            tracing::warn!(
                flow_id = %state,
                provider = %flow.provider,
                "a link callback arrived under another account's session or none"
            );
            return Err(FinishError::SessionMismatch);
        }

        // Phase 3 — exchange. A network call, with no connection and no lock
        // held.
        let NormalizedIdentity { subject, profile } = provider
            .exchange(
                code,
                &self.redirect_uri(&flow.provider),
                &flow.pkce_verifier,
            )
            .await?;
        let subject = validated_subject(subject)?;

        // Phase 4 — write, by intent.
        match flow.intent {
            Intent::SignIn => {
                self.sign_in(&flow.provider, &subject, &profile, flow.return_to)
                    .await
            }
            Intent::Link => {
                // Phase 2 proved the session names this account, so the flow's
                // own id is the one to write for.
                let account_id = flow.account_id.ok_or(FinishError::SessionMismatch)?;
                self.link(
                    account_id,
                    &flow.provider,
                    &subject,
                    &profile,
                    flow.return_to,
                )
                .await
            }
        }
    }

    /// The identity's account, created if this subject has never signed in
    /// before, with a session for it.
    async fn sign_in(
        &self,
        provider: &ProviderId,
        subject: &str,
        profile: &ProfileSnapshot,
        return_to: String,
    ) -> Result<Finished, FinishError> {
        let mut conn = self.db.acquire().await?;

        let account_id = match repository::find_identity(&mut *conn, provider, subject).await? {
            Some(identity) => identity.account_id,
            None => {
                let mut tx = conn.begin().await?;
                let account =
                    accounts::insert(&mut *tx, NewAccount::full(display_name_for(profile))).await?;
                match repository::insert_identity(&mut *tx, account.id, provider, subject, profile)
                    .await
                {
                    Ok(identity) => {
                        tx.commit().await?;
                        tracing::info!(
                            account_id = %account.id,
                            identity_id = %identity.id,
                            provider = %provider,
                            "account created from an external identity"
                        );
                        account.id
                    }
                    Err(LinkError::AlreadyLinked) => {
                        // Two first sign-ins of the same subject raced, and
                        // this one lost at the unique index. The rollback
                        // takes the provisional account with it; the winner
                        // has committed, so a fresh lookup finds the account
                        // to sign in to. The caller proved the identity, so
                        // it signs in rather than failing (ADR 0023 (a)).
                        tx.rollback().await?;
                        let winner = repository::find_identity(&mut *conn, provider, subject)
                            .await?
                            .ok_or(FinishError::Contended)?;
                        tracing::info!(
                            account_id = %winner.account_id,
                            provider = %provider,
                            "a concurrent first sign-in resolved to the winning account"
                        );
                        winner.account_id
                    }
                    Err(error) => return Err(error.into()),
                }
            }
        };

        // The delegate acquires for itself, so this connection goes back
        // first.
        drop(conn);
        let session = self
            .sessions
            .create(account_id, SessionOrigin::ExternalSignIn)
            .await?;

        Ok(Finished::SignedIn { session, return_to })
    }

    /// Attaches the identity to the account the flow was started for. One
    /// statement, so no transaction; no session is issued.
    async fn link(
        &self,
        account_id: Uuid,
        provider: &ProviderId,
        subject: &str,
        profile: &ProfileSnapshot,
        return_to: String,
    ) -> Result<Finished, FinishError> {
        let mut conn = self.db.acquire().await?;
        let identity =
            repository::insert_identity(&mut *conn, account_id, provider, subject, profile).await?;
        drop(conn);

        tracing::info!(
            account_id = %account_id,
            identity_id = %identity.id,
            provider = %provider,
            "external identity linked"
        );

        Ok(Finished::Linked {
            identity_id: identity.id,
            return_to,
        })
    }

    /// An account's identities, oldest first. The list endpoint is #755's;
    /// this is what the guard and the tests read.
    pub async fn list(
        &self,
        account_id: Uuid,
    ) -> Result<Vec<super::ExternalIdentity>, sqlx::Error> {
        let mut conn = self.db.acquire().await?;
        repository::list_for_account(&mut *conn, account_id).await
    }

    /// The provider registered under `slug`, if the slug is one at all.
    fn resolve(&self, slug: &str) -> Option<std::sync::Arc<dyn Provider>> {
        self.providers.get(&ProviderId::try_new(slug).ok()?)
    }

    /// The provider of a flow, if the callback's path names the same one. A
    /// `state` minted for another provider is structurally detectable because
    /// each provider has a callback path of its own, and it is as good as no
    /// flow at all.
    fn matching_provider(
        &self,
        slug: &str,
        of_flow: &ProviderId,
    ) -> Option<std::sync::Arc<dyn Provider>> {
        let requested = ProviderId::try_new(slug).ok()?;
        if &requested != of_flow {
            return None;
        }
        self.providers.get(of_flow)
    }

    /// The callback's absolute address for a provider: what the provider has
    /// registered, built from the announced issuer.
    fn redirect_uri(&self, provider: &ProviderId) -> Url {
        let path = format!("/identities/{provider}/callback");
        Url::parse(&format!("{}{path}", self.issuer)).unwrap_or_else(|_| {
            // `CAS_ISSUER` is a URL with no trailing slash, and the path is
            // built from a validated slug, so this cannot happen. A relative
            // address would send the browser nowhere useful, so it is worth
            // a line rather than a silent fallback.
            tracing::error!(
                issuer = self.issuer,
                "CAS_ISSUER does not form an absolute callback address"
            );
            Url::parse("http://invalid.invalid/").expect("a constant URL parses")
        })
    }
}

/// Whether the cookie the request presented is the one the flow was started
/// with. Compared in constant time, and a missing or malformed cookie is the
/// same answer as a wrong one.
fn presented_secret_matches(presented: Option<&str>, browser_hash: &[u8]) -> bool {
    let Some(secret) = presented.and_then(FlowSecret::parse) else {
        return false;
    };
    secret.hash().ct_eq(browser_hash).into()
}

/// The provider's subject exactly as it answered, or a refusal.
///
/// The subject is the key an identity is found by, so it is validated and
/// never repaired. Trimming or cutting it would map two of a provider's
/// distinct subjects onto one `(provider, provider_subject)` row — `"alice"`
/// and `" alice"`, or two subjects sharing the first
/// [`MAX_PROVIDER_SUBJECT_LENGTH`] characters — and the person who reached
/// that row first would be the account the next one signs in to. The unique
/// constraint cannot see a collision CAS made before the lookup.
///
/// A subject CAS cannot key by is a failed exchange: the provider answered,
/// and the answer is unusable.
fn validated_subject(subject: String) -> Result<String, FinishError> {
    let refusal = if subject.trim().is_empty() {
        "the provider answered with no subject"
    } else if subject.chars().count() > MAX_PROVIDER_SUBJECT_LENGTH {
        "the provider's subject is longer than CAS accepts"
    } else {
        return Ok(subject);
    };

    tracing::warn!(refusal, "a provider's subject cannot identify a person");
    Err(FinishError::Exchange(ExchangeError::Rejected(
        refusal.to_owned(),
    )))
}

/// The display name a new account gets: the provider's name, then its
/// handle, then [`FALLBACK_DISPLAY_NAME`]. A provider's string is not a
/// label CAS can trust — an invisible character, a direction change, a name
/// longer than the cap — so each candidate is tried through the rules and the
/// first that passes wins (ADR 0023 (e)).
fn display_name_for(profile: &ProfileSnapshot) -> DisplayName {
    profile
        .name_candidates()
        .find_map(|candidate| DisplayName::try_new(candidate).ok())
        .unwrap_or_else(|| {
            DisplayName::try_new(FALLBACK_DISPLAY_NAME)
                .expect("the fallback display name is a valid label")
        })
}

/// `return_to` as it may be written into a flow row: a path on the frontend
/// and nothing else.
///
/// Anything that could send the browser off-site is refused rather than
/// repaired: a value starting with `//` (or `/\`, which a browser reads the
/// same way) names another host, and so does anything with a scheme — which
/// cannot start with `/`. Nothing asked for is the default path.
fn validate_return_to(value: Option<&str>) -> Result<String, StartError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(DEFAULT_RETURN_TO.to_owned());
    };
    let refused = value.chars().count() > MAX_RETURN_TO_LENGTH
        || !value.starts_with('/')
        || value.starts_with("//")
        || value.starts_with("/\\")
        || value.contains('\\')
        || value.chars().any(|c| c.is_control() || c.is_whitespace());
    if refused {
        return Err(StartError::InvalidReturnTo);
    }

    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;
    use std::sync::Arc;

    use crate::accounts::AccountType;
    use crate::identities::{ExternalIdentity, ProfileSnapshot};
    use crate::testing::{FakeProvider, display_name, register_soft_passkey};

    const SLUG: &str = "telegram";

    fn provider_id() -> ProviderId {
        ProviderId::try_new(SLUG).unwrap()
    }

    fn profile() -> ProfileSnapshot {
        ProfileSnapshot::new(
            Some("Ada Lovelace".to_owned()),
            Some("ada".to_owned()),
            Some("https://provider.test/ada.png".to_owned()),
        )
    }

    /// The service over `db`, with one fake provider registered.
    fn identity_service(
        db: impl Into<Db> + Clone,
        provider: &Arc<FakeProvider>,
    ) -> IdentityService {
        let db = db.into();
        IdentityService::new(
            db.clone(),
            Providers::new([Arc::clone(provider) as Arc<dyn Provider>]),
            SessionService::new(db),
            "http://localhost:3000".to_owned(),
        )
    }

    fn fake() -> Arc<FakeProvider> {
        Arc::new(FakeProvider::new(SLUG).answering("42", profile()))
    }

    /// The `state` of an authorization URL the fake built.
    fn state_of(url: &Url) -> Uuid {
        param(url, "state").parse().expect("the state is a uuid")
    }

    /// One query parameter of an authorization URL.
    fn param(url: &Url, name: &str) -> String {
        url.query_pairs()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.into_owned())
            .unwrap_or_else(|| panic!("the authorization URL carries {name}: {url}"))
    }

    /// Unchecked query: see docs/TESTS.md.
    async fn accounts_count(pool: &PgPool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM accounts")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Unchecked query: see docs/TESTS.md.
    async fn identity_rows(pool: &PgPool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM external_identities")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Unchecked query: see docs/TESTS.md.
    async fn sessions_of(pool: &PgPool, account_id: Uuid) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM sessions WHERE account_id = $1")
            .bind(account_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Starts a sign-in flow and returns what the callback needs.
    async fn start_sign_in(service: &IdentityService) -> (Uuid, FlowSecret) {
        let started = service
            .start(SLUG, Intent::SignIn, None, Some("/dashboard"))
            .await
            .unwrap();
        (state_of(&started.url), started.secret)
    }

    #[sqlx::test]
    async fn start_refuses_a_provider_that_is_not_registered(pool: PgPool) {
        let service = identity_service(pool, &fake());

        for slug in ["github", "Telegram", "", "not a slug"] {
            let error = service
                .start(slug, Intent::SignIn, None, None)
                .await
                .unwrap_err();
            assert!(
                matches!(error, StartError::UnknownProvider),
                "{slug}: {error:?}"
            );
        }
    }

    #[sqlx::test]
    async fn start_carries_the_state_and_the_pkce_challenge_to_the_provider(pool: PgPool) {
        let provider = fake();
        let service = identity_service(pool, &provider);

        let started = service
            .start(SLUG, Intent::SignIn, None, None)
            .await
            .unwrap();

        assert_eq!(param(&started.url, "code_challenge_method"), "S256");
        assert_eq!(param(&started.url, "code_challenge").len(), 43);
        assert_eq!(
            provider.redirect_uri().expect("the provider was given one"),
            "http://localhost:3000/identities/telegram/callback"
                .parse::<Url>()
                .unwrap(),
            "the redirect URI is built from the announced issuer"
        );
        // The `state` is the flow row's id: it names a flow that was written.
        let state = state_of(&started.url);
        assert_eq!(taken(&service, state).await.provider, provider_id());
    }

    /// Only a path, and the default when nothing is asked for.
    #[sqlx::test]
    async fn start_validates_return_to(pool: PgPool) {
        let service = identity_service(pool, &fake());
        // A path that only the length rule can refuse: `"/".repeat(n)` would
        // be refused for starting with `//` even with that rule deleted.
        let too_long = format!("/{}", "a".repeat(MAX_RETURN_TO_LENGTH));
        let longest = format!("/{}", "a".repeat(MAX_RETURN_TO_LENGTH - 1));

        for value in [
            Some("//evil.example"),
            Some("/\\evil.example"),
            Some("https://evil.example"),
            Some("dashboard"),
            Some("/a b"),
            Some("/back\\slash"),
            Some("/\u{0}"),
            Some(too_long.as_str()),
        ] {
            let error = service
                .start(SLUG, Intent::SignIn, None, value)
                .await
                .unwrap_err();
            assert!(
                matches!(error, StartError::InvalidReturnTo),
                "{value:?}: {error:?}"
            );
        }

        for value in [None, Some(""), Some("   ")] {
            let started = service
                .start(SLUG, Intent::SignIn, None, value)
                .await
                .unwrap();
            let flow = taken(&service, state_of(&started.url)).await;
            assert_eq!(flow.return_to, DEFAULT_RETURN_TO, "{value:?}");
        }

        let started = service
            .start(SLUG, Intent::SignIn, None, Some(" /dashboard?tab=1 "))
            .await
            .unwrap();
        assert_eq!(
            taken(&service, state_of(&started.url)).await.return_to,
            "/dashboard?tab=1"
        );

        // The boundary from the other side: the longest accepted value is
        // exactly the cap, so neither the rule nor the constant can move
        // without this test saying so.
        assert_eq!(longest.chars().count(), MAX_RETURN_TO_LENGTH);
        let started = service
            .start(SLUG, Intent::SignIn, None, Some(longest.as_str()))
            .await
            .unwrap();
        assert_eq!(
            taken(&service, state_of(&started.url)).await.return_to,
            longest
        );
    }

    /// An `/oidc/authorize` continuation with `state` and `nonce` written as
    /// the given escapes repeated to the endpoint's decoded byte limit. The
    /// continuation is the request as sent, so an escape that costs three
    /// characters per byte is what the bound has to survive.
    fn authorize_continuation(state_escape: &str, nonce_escape: &str) -> String {
        format!(
            "/oidc/authorize?client_id=ligretto&response_type=code\
             &redirect_uri=https%3A%2F%2Fligretto.example%2Fcallback&scope=openid+profile\
             &code_challenge={}&code_challenge_method=S256&state={}&nonce={}",
            "c".repeat(43),
            state_escape.repeat(MAX_STATE_LENGTH),
            nonce_escape.repeat(MAX_NONCE_LENGTH),
        )
    }

    /// The bound has to fit what CAS's own `/oidc/authorize` accepts: that
    /// endpoint sends an anonymous browser to the frontend with the whole
    /// authorization request as `return_to`, and the identity flow carries
    /// that continuation on. A request with the longest `state` and `nonce`
    /// the endpoint allows must therefore start a flow — including when the
    /// client writes them as escapes, which `/oidc/authorize` measures
    /// decoded while the continuation carries them encoded.
    #[sqlx::test]
    async fn start_accepts_the_longest_authorize_continuation(pool: PgPool) {
        let service = identity_service(pool, &fake());
        // `%2B` is a `+` as a client must send it (a raw `+` decodes to a
        // space), the worst case any byte can take: three characters each.
        let widest = authorize_continuation("%2B", "%2B");
        let query = widest.split_once('?').expect("the continuation has one").1;
        let params = crate::oidc::authorization::Params::from_query(query);
        assert_eq!(
            params.get("state").unwrap().map(str::len),
            Some(MAX_STATE_LENGTH),
            "the escapes must decode to exactly what /oidc/authorize accepts"
        );
        assert_eq!(
            params.get("nonce").unwrap().map(str::len),
            Some(MAX_NONCE_LENGTH)
        );

        for continuation in [authorize_continuation("s", "n"), widest.clone()] {
            let started = service
                .start(SLUG, Intent::SignIn, None, Some(&continuation))
                .await
                .expect("a continuation /oidc/authorize accepts is a valid return_to");

            assert_eq!(
                taken(&service, state_of(&started.url)).await.return_to,
                continuation
            );
        }
    }

    /// Reads a flow row out, consuming it, to see what `start` wrote.
    async fn taken(service: &IdentityService, state: Uuid) -> repository::Flow {
        let mut conn = service.db.acquire().await.unwrap();
        repository::take_flow(&mut conn, state)
            .await
            .unwrap()
            .expect("the flow was written")
    }

    #[sqlx::test]
    async fn an_unknown_subject_creates_a_full_account_with_the_snapshot(pool: PgPool) {
        let provider = fake();
        let service = identity_service(pool.clone(), &provider);
        let started = service
            .start(SLUG, Intent::SignIn, None, Some("/dashboard"))
            .await
            .unwrap();
        let challenge = param(&started.url, "code_challenge");
        let (state, secret) = (state_of(&started.url), started.secret);

        let finished = service
            .finish(
                SLUG,
                state,
                Callback::Code("the-code".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap();

        let Finished::SignedIn { session, return_to } = finished else {
            panic!("a sign-in flow signs in: {finished:?}");
        };
        assert_eq!(return_to, "/dashboard");
        let identity = service.list(session.session.account_id).await.unwrap();
        assert_eq!(identity.len(), 1);
        assert_eq!(identity[0].provider, provider_id());
        assert_eq!(identity[0].provider_subject, "42");
        assert_eq!(identity[0].profile, profile());
        let account = accounts::get(
            &mut *pool.acquire().await.unwrap(),
            session.session.account_id,
        )
        .await
        .unwrap()
        .expect("the account was created");
        assert_eq!(account.r#type, AccountType::Full);
        assert_eq!(account.display_name.as_ref(), "Ada Lovelace");
        // PKCE round-tripped: the verifier the provider was handed is the one
        // whose challenge went out in the authorization URL.
        let presented = provider.exchanged_verifier().expect("the exchange ran");
        assert_eq!(presented.challenge().as_str(), challenge);
    }

    #[sqlx::test]
    async fn a_second_sign_in_reuses_the_account(pool: PgPool) {
        let provider = fake();
        let service = identity_service(pool.clone(), &provider);

        let (state, secret) = start_sign_in(&service).await;
        let first = service
            .finish(
                SLUG,
                state,
                Callback::Code("c1".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap();
        let (state, secret) = start_sign_in(&service).await;
        let second = service
            .finish(
                SLUG,
                state,
                Callback::Code("c2".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap();

        let (
            Finished::SignedIn { session: first, .. },
            Finished::SignedIn {
                session: second, ..
            },
        ) = (first, second)
        else {
            panic!("both are sign-ins");
        };
        assert_eq!(first.session.account_id, second.session.account_id);
        assert_ne!(
            first.session.id, second.session.id,
            "a new session each time"
        );
        assert_eq!(accounts_count(&pool).await, 1);
        assert_eq!(identity_rows(&pool).await, 1);
    }

    /// Signs in through a provider answering `subject`, each call with its
    /// own provider and service over the one database.
    async fn sign_in_with_subject(pool: &PgPool, subject: &str) -> Result<Finished, FinishError> {
        let provider = Arc::new(FakeProvider::new(SLUG).answering(subject, profile()));
        let service = identity_service(pool.clone(), &provider);
        let (state, secret) = start_sign_in(&service).await;
        service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
    }

    /// The account a finished sign-in opened a session for.
    fn account_of(finished: Finished) -> Uuid {
        match finished {
            Finished::SignedIn { session, .. } => session.session.account_id,
            other => panic!("a sign-in: {other:?}"),
        }
    }

    /// The subjects on file, in a stable order the collation cannot reorder.
    /// Unchecked query: see docs/TESTS.md.
    async fn subjects(pool: &PgPool) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT provider_subject FROM external_identities ORDER BY provider_subject COLLATE \"C\"",
        )
        .fetch_all(pool)
        .await
        .unwrap()
    }

    /// The subject is the key an identity is found by, not display data: two
    /// subjects a provider keeps apart stay apart, whitespace and all.
    /// Trimming them would open the first person's account for the second.
    #[sqlx::test]
    async fn subjects_that_differ_only_in_whitespace_are_different_accounts(pool: PgPool) {
        let first = account_of(sign_in_with_subject(&pool, "alice").await.unwrap());

        let second = account_of(sign_in_with_subject(&pool, " alice").await.unwrap());

        assert_ne!(
            first, second,
            "a subject with whitespace around it is another subject"
        );
        assert_eq!(accounts_count(&pool).await, 2);
        assert_eq!(
            subjects(&pool).await,
            [" alice", "alice"],
            "stored exactly as the provider answered"
        );
    }

    /// A subject CAS cannot key an identity by is a failed exchange, not a
    /// repaired one: an empty answer must not become a row that every later
    /// empty answer resolves to, and an over-long one must not share a row
    /// with everything that has its first [`MAX_PROVIDER_SUBJECT_LENGTH`]
    /// characters.
    #[sqlx::test]
    async fn a_subject_cas_cannot_key_by_fails_the_exchange(pool: PgPool) {
        let over_long = "a".repeat(MAX_PROVIDER_SUBJECT_LENGTH + 1);

        for subject in ["", "   ", "\n", over_long.as_str()] {
            // Twice, because the failure a trim or a cut would cause is two
            // people landing on one account.
            for attempt in 1..=2 {
                let error = sign_in_with_subject(&pool, subject).await.unwrap_err();
                assert!(
                    matches!(error, FinishError::Exchange(ExchangeError::Rejected(_))),
                    "{subject:?} ({attempt}): {error:?}"
                );
            }
        }
        assert_eq!(
            accounts_count(&pool).await,
            0,
            "no account was created to be shared"
        );
        assert_eq!(identity_rows(&pool).await, 0);

        // The boundary from the other side: the longest subject a provider
        // may answer with signs in and is stored whole.
        let longest = "a".repeat(MAX_PROVIDER_SUBJECT_LENGTH);
        account_of(sign_in_with_subject(&pool, &longest).await.unwrap());
        assert_eq!(subjects(&pool).await, [longest]);
    }

    /// A provider's name may be anything; CAS's display names may not. The
    /// chain tries the handle next, then its own fallback.
    #[sqlx::test]
    async fn the_display_name_falls_back_through_the_chain(pool: PgPool) {
        let invisible = "Ada\u{200b}Lovelace";
        assert!(
            DisplayName::try_new(invisible).is_err(),
            "the premise: the label rules refuse it"
        );

        for (snapshot, expected) in [
            (
                ProfileSnapshot::new(Some(invisible.to_owned()), Some("ada".to_owned()), None),
                "ada",
            ),
            (
                ProfileSnapshot::new(Some(invisible.to_owned()), Some(invisible.to_owned()), None),
                FALLBACK_DISPLAY_NAME,
            ),
            (ProfileSnapshot::default(), FALLBACK_DISPLAY_NAME),
        ] {
            assert_eq!(display_name_for(&snapshot).as_ref(), expected);
        }

        // End to end, through a real sign-in.
        let provider = Arc::new(
            FakeProvider::new(SLUG).answering("7", ProfileSnapshot::new(None, None, None)),
        );
        let service = identity_service(pool.clone(), &provider);
        let (state, secret) = start_sign_in(&service).await;
        let finished = service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap();
        let Finished::SignedIn { session, .. } = finished else {
            panic!("a sign-in");
        };
        let account = accounts::get(
            &mut *pool.acquire().await.unwrap(),
            session.session.account_id,
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(account.display_name.as_ref(), FALLBACK_DISPLAY_NAME);
    }

    #[sqlx::test]
    async fn link_attaches_the_identity_to_the_flow_account(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let account_id = registered.account.id;
        let service = identity_service(pool.clone(), &fake());
        let started = service
            .start(SLUG, Intent::Link, Some(account_id), Some("/settings"))
            .await
            .unwrap();
        let sessions_before = sessions_of(&pool, account_id).await;

        let finished = service
            .finish(
                SLUG,
                state_of(&started.url),
                Callback::Code("c".to_owned()),
                Some(started.secret.expose()),
                Some(account_id),
            )
            .await
            .unwrap();

        let Finished::Linked { return_to, .. } = &finished else {
            panic!("a link flow links: {finished:?}");
        };
        assert_eq!(return_to, "/settings");
        let listed = service.list(account_id).await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].provider_subject, "42");
        assert_eq!(
            sessions_of(&pool, account_id).await,
            sessions_before,
            "linking issues no session"
        );
        assert_eq!(accounts_count(&pool).await, 1, "no account was created");
    }

    /// A link callback under another account's session, or none, finishes
    /// nothing — and the flow is spent all the same.
    #[sqlx::test]
    async fn link_under_the_wrong_session_is_a_mismatch_and_consumes_the_flow(pool: PgPool) {
        let (_, registered) = register_soft_passkey(&pool).await;
        let account_id = registered.account.id;
        let service = identity_service(pool.clone(), &fake());

        for current in [None, Some(Uuid::new_v4())] {
            let started = service
                .start(SLUG, Intent::Link, Some(account_id), None)
                .await
                .unwrap();
            let state = state_of(&started.url);

            let error = service
                .finish(
                    SLUG,
                    state,
                    Callback::Code("c".to_owned()),
                    Some(started.secret.expose()),
                    current,
                )
                .await
                .unwrap_err();

            assert!(matches!(error, FinishError::SessionMismatch), "{error:?}");
            let replay = service
                .finish(
                    SLUG,
                    state,
                    Callback::Code("c".to_owned()),
                    Some(started.secret.expose()),
                    Some(account_id),
                )
                .await
                .unwrap_err();
            assert!(matches!(replay, FinishError::FlowNotFound), "{replay:?}");
        }
        assert_eq!(identity_rows(&pool).await, 0);
    }

    /// An identity that is already on an account cannot be linked to
    /// another: a conflict stays a conflict (ADR 0023 (f)).
    #[sqlx::test]
    async fn link_of_an_identity_another_account_holds_is_a_conflict(pool: PgPool) {
        let service = identity_service(pool.clone(), &fake());
        let (state, secret) = start_sign_in(&service).await;
        service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap();
        let (_, registered) = register_soft_passkey(&pool).await;
        let other = registered.account.id;
        let started = service
            .start(SLUG, Intent::Link, Some(other), None)
            .await
            .unwrap();

        let error = service
            .finish(
                SLUG,
                state_of(&started.url),
                Callback::Code("c".to_owned()),
                Some(started.secret.expose()),
                Some(other),
            )
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::AlreadyLinked), "{error:?}");
        assert!(service.list(other).await.unwrap().is_empty());
    }

    #[sqlx::test]
    async fn a_foreign_or_replayed_state_finds_no_flow(pool: PgPool) {
        let service = identity_service(pool, &fake());
        let (state, secret) = start_sign_in(&service).await;

        let foreign = service
            .finish(
                SLUG,
                Uuid::new_v4(),
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap_err();
        assert!(matches!(foreign, FinishError::FlowNotFound), "{foreign:?}");

        service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap();
        let replayed = service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap_err();
        assert!(
            matches!(replayed, FinishError::FlowNotFound),
            "{replayed:?}"
        );
    }

    /// Each provider has its own callback path, so a `state` arriving on the
    /// wrong one names no flow this path could finish.
    #[sqlx::test]
    async fn a_state_on_another_providers_path_finds_no_flow(pool: PgPool) {
        let providers = Providers::new([
            Arc::new(FakeProvider::new(SLUG).answering("42", profile())) as Arc<dyn Provider>,
            Arc::new(FakeProvider::new("github").answering("7", profile())) as Arc<dyn Provider>,
        ]);
        let db: Db = pool.into();
        let service = IdentityService::new(
            db.clone(),
            providers,
            SessionService::new(db),
            "http://localhost:3000".to_owned(),
        );
        let started = service
            .start(SLUG, Intent::SignIn, None, None)
            .await
            .unwrap();

        let error = service
            .finish(
                "github",
                state_of(&started.url),
                Callback::Code("c".to_owned()),
                Some(started.secret.expose()),
                None,
            )
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::FlowNotFound), "{error:?}");
    }

    /// The browser binding: without the cookie the flow was started with,
    /// the callback finishes nothing (ADR 0023 (d)).
    #[sqlx::test]
    async fn a_missing_or_wrong_flow_cookie_is_a_foreign_flow(pool: PgPool) {
        let service = identity_service(pool.clone(), &fake());
        let other = FlowSecret::generate().unwrap();

        for presented in [None, Some("not-a-secret"), Some(other.expose())] {
            let (state, _) = start_sign_in(&service).await;

            let error = service
                .finish(SLUG, state, Callback::Code("c".to_owned()), presented, None)
                .await
                .unwrap_err();

            assert!(
                matches!(error, FinishError::ForeignFlow),
                "{presented:?}: {error:?}"
            );
        }
        assert_eq!(accounts_count(&pool).await, 0);
        assert_eq!(identity_rows(&pool).await, 0);
    }

    /// Both exchange failures keep their own shape, and either way the flow
    /// is spent: a retry with the same `state` finds nothing.
    #[sqlx::test]
    async fn an_exchange_failure_keeps_its_kind_and_consumes_the_flow(pool: PgPool) {
        for (provider, expected_unavailable) in [
            (Arc::new(FakeProvider::new(SLUG).rejecting()), false),
            (Arc::new(FakeProvider::new(SLUG).unavailable()), true),
        ] {
            let service = identity_service(pool.clone(), &provider);
            let (state, secret) = start_sign_in(&service).await;

            let error = service
                .finish(
                    SLUG,
                    state,
                    Callback::Code("c".to_owned()),
                    Some(secret.expose()),
                    None,
                )
                .await
                .unwrap_err();

            match (&error, expected_unavailable) {
                (FinishError::Exchange(ExchangeError::Rejected(_)), false)
                | (FinishError::Exchange(ExchangeError::Unavailable(_)), true) => {}
                _ => panic!("{error:?}"),
            }
            let replay = service
                .finish(
                    SLUG,
                    state,
                    Callback::Code("c".to_owned()),
                    Some(secret.expose()),
                    None,
                )
                .await
                .unwrap_err();
            assert!(matches!(replay, FinishError::FlowNotFound), "{replay:?}");
        }
        assert_eq!(accounts_count(&pool).await, 0);
    }

    /// A provider that refused is an answer too: the flow is consumed, and
    /// the exchange never runs.
    #[sqlx::test]
    async fn a_denied_callback_consumes_the_flow_without_exchanging(pool: PgPool) {
        let provider = fake();
        let service = identity_service(pool.clone(), &provider);
        let (state, secret) = start_sign_in(&service).await;

        let error = service
            .finish(SLUG, state, Callback::Denied, Some(secret.expose()), None)
            .await
            .unwrap_err();

        assert!(matches!(error, FinishError::ProviderDenied), "{error:?}");
        assert_eq!(provider.exchanges(), 0, "nothing was exchanged");
        let replay = service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .unwrap_err();
        assert!(matches!(replay, FinishError::FlowNotFound), "{replay:?}");
    }

    /// The Worker's shape: one connection for the whole request, where a
    /// second overlapping acquire fails at once. Every step of both intents
    /// has to give the connection back before the next one takes it.
    #[sqlx::test]
    async fn no_step_overlaps_acquires_on_one_connection(pool: PgPool) {
        let provider = fake();
        let db = Db::connection(pool.acquire().await.unwrap().detach());
        let service = identity_service(db, &provider);

        // sign-in, miss branch: account and identity created.
        let (state, secret) = start_sign_in(&service).await;
        service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .expect("the miss branch runs on one connection");

        // sign-in, hit branch: the identity is found.
        let (state, secret) = start_sign_in(&service).await;
        service
            .finish(
                SLUG,
                state,
                Callback::Code("c".to_owned()),
                Some(secret.expose()),
                None,
            )
            .await
            .expect("the hit branch runs on one connection");

        // link, on a second account.
        let (_, registered) = register_soft_passkey(&pool).await;
        let other = registered.account.id;
        let started = service
            .start(SLUG, Intent::Link, Some(other), None)
            .await
            .unwrap();
        let error = service
            .finish(
                SLUG,
                state_of(&started.url),
                Callback::Code("c".to_owned()),
                Some(started.secret.expose()),
                Some(other),
            )
            .await
            .unwrap_err();
        assert!(
            matches!(error, FinishError::AlreadyLinked),
            "the link reaches its own conflict rather than a pool timeout: {error:?}"
        );

        // A replay after a failed exchange, on another one-connection handle.
        let unavailable = Arc::new(FakeProvider::new(SLUG).unavailable());
        let service = identity_service(
            Db::connection(pool.acquire().await.unwrap().detach()),
            &unavailable,
        );
        let (state, secret) = start_sign_in(&service).await;
        assert!(matches!(
            service
                .finish(
                    SLUG,
                    state,
                    Callback::Code("c".to_owned()),
                    Some(secret.expose()),
                    None
                )
                .await
                .unwrap_err(),
            FinishError::Exchange(_)
        ));
        assert!(matches!(
            service
                .finish(
                    SLUG,
                    state,
                    Callback::Code("c".to_owned()),
                    Some(secret.expose()),
                    None
                )
                .await
                .unwrap_err(),
            FinishError::FlowNotFound
        ));
    }

    /// Two first sign-ins of one unknown subject: the loser must end up
    /// signed in to the winner's account, with nothing left over.
    ///
    /// The race is made deterministic the way `concurrent_requests_renew_once`
    /// does it: the winner's account and identity are written in a
    /// transaction that is held open, so the loser's insert blocks on the
    /// unique index until it commits.
    #[sqlx::test]
    async fn a_concurrent_first_sign_in_resolves_to_the_winner(pool: PgPool) {
        let service = identity_service(pool.clone(), &fake());
        let (state, secret) = start_sign_in(&service).await;

        let mut winner_tx = pool.begin().await.unwrap();
        let winner = accounts::insert(&mut *winner_tx, NewAccount::full(display_name("Winner")))
            .await
            .unwrap();
        repository::insert_identity(
            &mut *winner_tx,
            winner.id,
            &provider_id(),
            "42",
            &ProfileSnapshot::default(),
        )
        .await
        .unwrap();

        let loser = tokio::spawn({
            let service = service.clone();
            let secret = secret.expose().to_owned();
            async move {
                service
                    .finish(
                        SLUG,
                        state,
                        Callback::Code("c".to_owned()),
                        Some(&secret),
                        None,
                    )
                    .await
            }
        });
        // Give the loser time to reach the index and block on it.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        winner_tx.commit().await.unwrap();

        let finished = loser.await.unwrap().expect("the loser signs in");
        let Finished::SignedIn { session, .. } = finished else {
            panic!("a sign-in");
        };
        assert_eq!(
            session.session.account_id, winner.id,
            "the loser signs in to the winning account"
        );
        assert_eq!(identity_rows(&pool).await, 1);
        assert_eq!(
            accounts_count(&pool).await,
            1,
            "the loser's provisional account rolled back"
        );
        let listed: Vec<ExternalIdentity> = service.list(winner.id).await.unwrap();
        assert_eq!(listed.len(), 1);
    }
}
