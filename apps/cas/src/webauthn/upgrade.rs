//! The guest upgrade: the ceremony that registers the first passkey of a
//! guest account and turns it into a full account with the same id, so the
//! `sub` an application keeps its data under survives.
//!
//! It runs on the account-registration endpoints, chosen by the session and
//! not by a parameter: a request that carries an upgrade session — which
//! `/oidc/authorize` opened for a guest's `id_token_hint` — upgrades that guest
//! instead of creating an account. The challenge is the one registration
//! issues (ADR 0001 (d), (e)), with the guest's id as the WebAuthn user
//! handle; the guest has no credential, so nothing is excluded.
//!
//! The upgrade is a privilege change, guarded against session fixation: an
//! attacker who opened an upgrade session for a guest and lured a victim into
//! registering under it must hold nothing afterwards. So the finish is one
//! transaction under the account's row lock that stores the passkey, makes
//! the account full, ends every session of the account and writes a fresh
//! full one for this browser, revokes every grant and deletes every other
//! pending ceremony. See `docs/adr/0015-guest-upgrade.md` (e), (f).

use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;
use webauthn_rs::prelude::{RegisterPublicKeyCredential, Webauthn};

use crate::accounts::{self, Account, AccountType, DisplayName};
use crate::oidc::revoke_account_grants;
use crate::sessions::service::IssuedSession;
use crate::sessions::{Session, SessionKind, SessionOrigin, SessionToken, rotate_upgraded};
use crate::webauthn::ceremonies::{PendingUpgrade, Taken};
use crate::webauthn::passkeys::{CreateError, DEFAULT_PASSKEY_NAME, PasskeyCredential};
use crate::webauthn::registration::{
    FinishError, StartError, StartedRegistration, start_discoverable_registration,
    verify_discoverable_registration,
};
use crate::webauthn::repository;

/// Why an upgrade did not finish.
#[derive(Debug, Error)]
pub enum UpgradeError {
    /// The ceremony failed the way an account registration fails: unknown,
    /// expired or another account's ceremony, a wrong answer, a credential
    /// already stored, a non-discoverable credential, the database.
    #[error(transparent)]
    Finish(#[from] FinishError),

    /// The session the upgrade runs under is no longer an upgrade session of
    /// a guest: it was revoked, or the account was upgraded by another
    /// browser first. Nothing was changed.
    #[error("the upgrade session has ended")]
    SessionEnded,

    /// The operating system refused to provide randomness for the new
    /// session token.
    #[error("failed to generate a session token: {0}")]
    Random(#[source] getrandom::Error),
}

impl From<sqlx::Error> for UpgradeError {
    fn from(error: sqlx::Error) -> Self {
        Self::Finish(FinishError::Db(error))
    }
}

/// What a finished upgrade produced: the account, now full, the passkey it
/// registered, and the full session that replaces the upgrade session, with
/// the token for the browser's cookie.
#[derive(Debug)]
pub struct Upgraded {
    pub account: Account,
    pub credential: PasskeyCredential,
    pub issued: IssuedSession,
}

#[derive(Debug, Clone)]
pub struct UpgradeService {
    webauthn: Webauthn,
    pool: PgPool,
}

impl UpgradeService {
    pub fn new(webauthn: Webauthn, pool: PgPool) -> Self {
        Self { webauthn, pool }
    }

    /// Issues the registration challenge for `account`, the guest the upgrade
    /// session names, under the name it chose.
    ///
    /// The user handle is the guest's id: the credential can only ever sign
    /// that account in (ADR 0003 (a)), and that is what keeps the `sub`.
    pub async fn start(
        &self,
        account: &Account,
        display_name: DisplayName,
    ) -> Result<StartedRegistration, StartError> {
        let (ccr, state) =
            start_discoverable_registration(&self.webauthn, account.id, &display_name, None)
                .map_err(StartError::Webauthn)?;

        let registration_id = repository::start_ceremony(
            &self.pool,
            &PendingUpgrade {
                account_id: account.id,
                display_name,
                state,
            },
        )
        .await?;

        Ok(StartedRegistration {
            registration_id,
            ccr,
        })
    }

    /// Verifies the browser's answer and upgrades the guest `session` names.
    ///
    /// One transaction, in this order, so that every step sees the account as
    /// the lock holder left it (ADR 0015 (f)):
    ///
    /// 1. the account row is locked `FOR UPDATE`; no account, or one that is
    ///    no longer a guest, is [`UpgradeError::SessionEnded`] — the browser
    ///    that lost a race lands here;
    /// 2. the ceremony is consumed; a ceremony another account's session
    ///    started is consumed and reported as not found, as for an addition;
    /// 3. the answer is verified; a wrong one commits the consumed ceremony
    ///    and leaves the guest as it was;
    /// 4. the passkey is stored under the guest's id;
    /// 5. the account becomes full, with the chosen name;
    /// 6. every session of the account is deleted and a full one written for
    ///    this browser; if the upgrade session was not among them, it was
    ///    revoked meanwhile and everything rolls back;
    /// 7. every grant of the account is revoked;
    /// 8. every other pending ceremony of the account is deleted.
    ///
    /// The session events are logged after the commit.
    pub async fn finish(
        &self,
        session: &Session,
        registration_id: Uuid,
        response: &RegisterPublicKeyCredential,
    ) -> Result<Upgraded, UpgradeError> {
        if session.kind != SessionKind::Upgrade {
            return Err(UpgradeError::SessionEnded);
        }
        let account_id = session.account_id;
        // Drawn before the transaction opens, so a refusal of the OS never
        // holds the account's lock.
        let token = SessionToken::generate().map_err(UpgradeError::Random)?;

        let mut tx = self.pool.begin().await?;

        match accounts::lock(&mut *tx, account_id).await? {
            Some(account) if account.r#type == AccountType::Guest => {}
            _ => return Err(UpgradeError::SessionEnded),
        }

        let pending: PendingUpgrade =
            match repository::take_ceremony(&mut *tx, registration_id).await? {
                Taken::Found(pending) => pending,
                // Found and deleted, only its state was unusable: the commit
                // makes the deletion stick.
                Taken::Undecodable => {
                    tx.commit().await?;
                    return Err(FinishError::NotFound.into());
                }
                Taken::Missing => return Err(FinishError::NotFound.into()),
            };

        if pending.account_id != account_id {
            tracing::warn!(
                registration_id = %registration_id,
                account_id = %account_id,
                "a guest upgrade was answered by another account's session"
            );
            tx.commit().await?;
            return Err(FinishError::NotFound.into());
        }

        let passkey =
            match verify_discoverable_registration(&self.webauthn, response, &pending.state) {
                Ok(passkey) => passkey,
                // The challenge was answered, wrongly: the commit makes the
                // consumed ceremony stick, and the guest stays a guest.
                Err(error) => {
                    tx.commit().await?;
                    return Err(error.into());
                }
            };

        let credential =
            repository::insert_passkey(&mut *tx, account_id, &passkey, DEFAULT_PASSKEY_NAME)
                .await
                .map_err(|error| FinishError::from(CreateError::from(error)))?;

        // Under the lock the row was a guest a moment ago, so this matches;
        // `None` would mean the lock did not hold, and nothing is committed.
        let Some(account) =
            accounts::upgrade_guest(&mut *tx, account_id, &pending.display_name).await?
        else {
            return Err(UpgradeError::SessionEnded);
        };

        let Some(rotated) = rotate_upgraded(&mut tx, &token, account_id, session.id).await? else {
            return Err(UpgradeError::SessionEnded);
        };

        revoke_account_grants(&mut *tx, account_id).await?;
        repository::delete_ceremonies_of_account(&mut *tx, account_id).await?;

        tx.commit().await?;

        for ended in &rotated.ended {
            tracing::info!(
                session_id = %ended,
                account_id = %account_id,
                reason = "upgrade",
                "session revoked"
            );
        }
        tracing::info!(
            session_id = %rotated.session.id,
            account_id = %account_id,
            kind = SessionKind::Full.as_str(),
            origin = SessionOrigin::Upgrade.as_str(),
            "session created"
        );
        tracing::info!(
            account_id = %account_id,
            passkey_id = %credential.id,
            "account upgraded"
        );

        Ok(Upgraded {
            account,
            credential,
            issued: IssuedSession {
                token,
                session: rotated.session,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::oidc::REFRESH_TOKEN_LIFETIME;
    use crate::sessions::SessionService;
    use crate::testing::{
        display_name, register_public_client, soft_passkey_registration, test_webauthn,
    };
    use crate::webauthn::repository::PasskeyRepository;

    const CLIENT: &str = "ligretto";

    fn service(pool: &PgPool) -> UpgradeService {
        UpgradeService::new(test_webauthn(), pool.clone())
    }

    /// A guest minted by [`CLIENT`], with a live grant of that client, as
    /// the guest grant leaves one.
    async fn guest(pool: &PgPool) -> Account {
        register_public_client(pool, CLIENT, &[]).await;
        let guest = AccountRepository::new(pool.clone())
            .create(NewAccount::guest(
                crate::clients::ClientId::try_new(CLIENT).unwrap(),
                7,
            ))
            .await
            .unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query(
            "INSERT INTO grants (account_id, client_id, scopes, expires_at) \
             VALUES ($1, $2, ARRAY['openid'], now() + make_interval(secs => $3))",
        )
        .bind(guest.id)
        .bind(CLIENT)
        .bind(REFRESH_TOKEN_LIFETIME.as_secs_f64())
        .execute(pool)
        .await
        .unwrap();
        guest
    }

    async fn count(pool: &PgPool, query: &'static str, account_id: Uuid) -> i64 {
        // Unchecked query: see docs/TESTS.md.
        sqlx::query_scalar(query)
            .bind(account_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    const SESSIONS: &str = "SELECT count(*) FROM sessions WHERE account_id = $1";
    const LIVE_GRANTS: &str =
        "SELECT count(*) FROM grants WHERE account_id = $1 AND revoked_at IS NULL";
    const CEREMONIES: &str = "SELECT count(*) FROM webauthn_ceremonies WHERE account_id = $1";
    const PASSKEYS: &str = "SELECT count(*) FROM passkey_credentials WHERE account_id = $1";

    async fn reloaded(pool: &PgPool, id: Uuid) -> Account {
        AccountRepository::new(pool.clone())
            .get(id)
            .await
            .unwrap()
            .unwrap()
    }

    /// What an upgrade changes or keeps, without the activity clock that
    /// opening a session moves.
    fn identity(account: &Account) -> (Uuid, AccountType, String, Option<String>) {
        (
            account.id,
            account.r#type,
            account.display_name.as_ref().to_owned(),
            account
                .created_by_client_id
                .as_ref()
                .map(|client| client.as_ref().to_owned()),
        )
    }

    /// The whole upgrade: same id, full, the chosen name, the minting client
    /// kept, one passkey; every session of the account gone and a full one
    /// in their place; the grant revoked; no ceremony of the account left.
    #[sqlx::test]
    async fn finishing_upgrades_the_guest_and_ends_everything_else(pool: PgPool) {
        let guest = guest(&pool).await;
        let sessions = SessionService::new(pool.clone());
        let upgrade = sessions.open_upgrade(guest.id).await.unwrap();
        let other = sessions.open_upgrade(guest.id).await.unwrap();
        let service = service(&pool);
        service
            .start(&guest, display_name("Someone else"))
            .await
            .unwrap();
        let started = service.start(&guest, display_name("Ada")).await.unwrap();
        let user_id = Uuid::from_slice(started.ccr.public_key.user.id.as_ref()).unwrap();
        assert_eq!(user_id, guest.id, "the user handle is the guest's id");
        let response = soft_passkey_registration(started.ccr);

        let upgraded = service
            .finish(&upgrade.session, started.registration_id, &response)
            .await
            .unwrap();

        assert_eq!(upgraded.account.id, guest.id);
        assert_eq!(upgraded.account.r#type, AccountType::Full);
        assert_eq!(upgraded.account.display_name.as_ref(), "Ada");
        assert_eq!(
            upgraded.account.created_by_client_id,
            guest.created_by_client_id
        );
        assert_eq!(
            identity(&reloaded(&pool, guest.id).await),
            identity(&upgraded.account)
        );
        let passkeys = PasskeyRepository::new(pool.clone())
            .list_for_account(guest.id)
            .await
            .unwrap();
        assert_eq!(passkeys.len(), 1);
        assert_eq!(passkeys[0].id, upgraded.credential.id);

        assert_eq!(sessions.authenticate(&upgrade.token).await.unwrap(), None);
        assert_eq!(sessions.authenticate(&other.token).await.unwrap(), None);
        assert_eq!(upgraded.issued.session.kind, SessionKind::Full);
        let (authenticated, _) = sessions
            .authenticate(&upgraded.issued.token)
            .await
            .unwrap()
            .expect("the new session is live");
        assert_eq!(authenticated.session, upgraded.issued.session);
        assert_eq!(count(&pool, SESSIONS, guest.id).await, 1);

        assert_eq!(count(&pool, LIVE_GRANTS, guest.id).await, 0);
        assert_eq!(count(&pool, CEREMONIES, guest.id).await, 0);
    }

    #[sqlx::test]
    async fn a_ceremony_of_another_guest_is_consumed_and_not_found(pool: PgPool) {
        let guest = guest(&pool).await;
        let other = AccountRepository::new(pool.clone())
            .create(NewAccount::guest(
                crate::clients::ClientId::try_new(CLIENT).unwrap(),
                8,
            ))
            .await
            .unwrap();
        let upgrade = SessionService::new(pool.clone())
            .open_upgrade(guest.id)
            .await
            .unwrap();
        let service = service(&pool);
        let started = service.start(&other, display_name("Bob")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);

        let error = service
            .finish(&upgrade.session, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(
            matches!(error, UpgradeError::Finish(FinishError::NotFound)),
            "{error:?}"
        );
        assert_eq!(count(&pool, CEREMONIES, other.id).await, 0, "consumed");
        assert_eq!(reloaded(&pool, guest.id).await.r#type, AccountType::Guest);
        assert_eq!(reloaded(&pool, other.id).await.r#type, AccountType::Guest);
    }

    /// A wrong answer burns the challenge and changes nothing else.
    #[sqlx::test]
    async fn a_failed_verification_consumes_the_ceremony_and_leaves_the_guest(pool: PgPool) {
        let guest = guest(&pool).await;
        let upgrade = SessionService::new(pool.clone())
            .open_upgrade(guest.id)
            .await
            .unwrap();
        let service = service(&pool);
        let started = service.start(&guest, display_name("Ada")).await.unwrap();
        let other = service.start(&guest, display_name("Ada")).await.unwrap();
        // The answer to another challenge.
        let response = soft_passkey_registration(other.ccr);

        let error = service
            .finish(&upgrade.session, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(
            matches!(error, UpgradeError::Finish(FinishError::Verification(_))),
            "{error:?}"
        );
        assert_eq!(
            count(&pool, CEREMONIES, guest.id).await,
            1,
            "only the other"
        );
        assert_eq!(identity(&reloaded(&pool, guest.id).await), identity(&guest));
        assert_eq!(count(&pool, SESSIONS, guest.id).await, 1);
        assert_eq!(count(&pool, LIVE_GRANTS, guest.id).await, 1);
        assert_eq!(count(&pool, PASSKEYS, guest.id).await, 0);
    }

    /// The credential is stored already: everything rolls back, the ceremony
    /// included, so the guest is still a guest and may retry.
    #[sqlx::test]
    async fn a_credential_already_registered_rolls_everything_back(pool: PgPool) {
        let guest = guest(&pool).await;
        let upgrade = SessionService::new(pool.clone())
            .open_upgrade(guest.id)
            .await
            .unwrap();
        let service = service(&pool);
        let started = service.start(&guest, display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        // Store the very credential the answer carries, under another
        // account, by verifying it against the stored ceremony state.
        // Unchecked query: see docs/TESTS.md.
        let state: serde_json::Value =
            sqlx::query_scalar("SELECT state FROM webauthn_ceremonies WHERE id = $1")
                .bind(started.registration_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        let pending: PendingUpgrade = serde_json::from_value(state).unwrap();
        let passkey = test_webauthn()
            .finish_passkey_registration(&response, &pending.state.passkey)
            .unwrap();
        let owner = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Bob")))
            .await
            .unwrap();
        repository::insert_passkey(&pool, owner.id, &passkey, "Bob's")
            .await
            .unwrap();

        let error = service
            .finish(&upgrade.session, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(
            matches!(
                error,
                UpgradeError::Finish(FinishError::CredentialAlreadyRegistered)
            ),
            "{error:?}"
        );
        assert_eq!(identity(&reloaded(&pool, guest.id).await), identity(&guest));
        assert_eq!(count(&pool, CEREMONIES, guest.id).await, 1, "still there");
        assert_eq!(count(&pool, SESSIONS, guest.id).await, 1);
        assert_eq!(count(&pool, LIVE_GRANTS, guest.id).await, 1);
    }

    #[sqlx::test]
    async fn a_revoked_upgrade_session_changes_nothing(pool: PgPool) {
        let guest = guest(&pool).await;
        let sessions = SessionService::new(pool.clone());
        let upgrade = sessions.open_upgrade(guest.id).await.unwrap();
        let service = service(&pool);
        let started = service.start(&guest, display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        sessions.revoke(&upgrade.token).await.unwrap();

        let error = service
            .finish(&upgrade.session, started.registration_id, &response)
            .await
            .unwrap_err();

        assert!(matches!(error, UpgradeError::SessionEnded), "{error:?}");
        assert_eq!(identity(&reloaded(&pool, guest.id).await), identity(&guest));
        assert_eq!(count(&pool, CEREMONIES, guest.id).await, 1);
        assert_eq!(count(&pool, LIVE_GRANTS, guest.id).await, 1);
        assert_eq!(count(&pool, PASSKEYS, guest.id).await, 0);
    }

    /// Two browsers finish an upgrade of the same guest at once. Both are
    /// held at the account's row lock taken here, so both are in flight
    /// before either proceeds; on release exactly one upgrades, and the other
    /// finds a full account and gets `SessionEnded`.
    #[sqlx::test]
    async fn two_upgrades_racing_let_one_win(pool: PgPool) {
        let guest = guest(&pool).await;
        let sessions = SessionService::new(pool.clone());
        let service = service(&pool);
        let mut attempts = Vec::new();
        for _ in 0..2 {
            let upgrade = sessions.open_upgrade(guest.id).await.unwrap();
            let started = service.start(&guest, display_name("Ada")).await.unwrap();
            let response = soft_passkey_registration(started.ccr);
            attempts.push((upgrade.session, started.registration_id, response));
        }

        let mut lock = pool.begin().await.unwrap();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("SELECT id FROM accounts WHERE id = $1 FOR UPDATE")
            .bind(guest.id)
            .execute(&mut *lock)
            .await
            .unwrap();
        let finishes: Vec<_> = attempts
            .into_iter()
            .map(|(session, registration_id, response)| {
                let service = service.clone();
                tokio::spawn(
                    async move { service.finish(&session, registration_id, &response).await },
                )
            })
            .collect();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        lock.commit().await.unwrap();

        let mut won = 0;
        let mut ended = 0;
        for finish in finishes {
            match finish.await.unwrap() {
                Ok(_) => won += 1,
                Err(UpgradeError::SessionEnded) => ended += 1,
                Err(error) => panic!("unexpected: {error:?}"),
            }
        }
        assert_eq!((won, ended), (1, 1));
        assert_eq!(count(&pool, PASSKEYS, guest.id).await, 1);
        assert_eq!(count(&pool, SESSIONS, guest.id).await, 1);
    }

    /// The log tells the story by row ids: the sessions ended, the one
    /// created, the account upgraded; never a token.
    #[sqlx::test]
    async fn the_upgrade_is_logged_without_the_token(pool: PgPool) {
        let guest = guest(&pool).await;
        let upgrade = SessionService::new(pool.clone())
            .open_upgrade(guest.id)
            .await
            .unwrap();
        let service = service(&pool);
        let started = service.start(&guest, display_name("Ada")).await.unwrap();
        let response = soft_passkey_registration(started.ccr);
        let (events, _guard) = crate::testing::capture_tracing();

        let upgraded = service
            .finish(&upgrade.session, started.registration_id, &response)
            .await
            .unwrap();

        let [revoked] = &events.mentioning("session revoked")[..] else {
            panic!("one revocation: {:?}", events.all());
        };
        assert!(
            revoked.contains(&upgrade.session.id.to_string()),
            "{revoked}"
        );
        let [created] = &events.mentioning("session created")[..] else {
            panic!("one creation: {:?}", events.all());
        };
        assert!(
            created.contains(&upgraded.issued.session.id.to_string()),
            "{created}"
        );
        assert!(created.contains("upgrade"), "{created}");
        let [account] = &events.mentioning("account upgraded")[..] else {
            panic!("one upgrade: {:?}", events.all());
        };
        assert!(account.contains(&guest.id.to_string()), "{account}");
        for event in events.all() {
            assert!(!event.contains(upgrade.token.expose()), "{event}");
            assert!(!event.contains(upgraded.issued.token.expose()), "{event}");
        }
    }
}
