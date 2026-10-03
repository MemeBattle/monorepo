//! The `id_token_hint` of an authorization request: the guest upgrade's way
//! in (ADR 0015 (c)). An application sends its guest's browser to
//! `/authorize` with a fresh ID token of that guest; a hint that passes opens
//! an upgrade session for the guest, so it is judged as the bearer credential
//! it is: signed by a published key, an ID token (`typ`), issued by this
//! issuer, to the client that makes the request, and not expired by CAS's
//! clock. Whose account it names, and whether that account is a guest, is
//! read from the row: the token's `account_type` claim is up to ten minutes
//! old.
//!
//! The handler answers a refused hint through the redirect URI; this decides
//! whether it is refused. Nothing here writes.

use time::OffsetDateTime;

use super::keys::VerifyingKeys;
use super::tokens;
use crate::accounts::{self, Account, AccountType};
use crate::clients::ClientId;

/// Why a hint was refused. The handler answers both with
/// `invalid_request`, each with a fixed description.
#[derive(Debug, thiserror::Error)]
pub enum HintError {
    /// Not an ID token CAS issued to the requesting client: a bad signature
    /// or an unknown key, another `typ`, another issuer, malformed claims, or
    /// an `aud` that is not the request's `client_id`.
    #[error("the id_token_hint is invalid")]
    Invalid,

    /// An ID token CAS issued to this client, past its `exp`.
    #[error("the id_token_hint has expired")]
    Expired,

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct UpgradeHintService {
    /// Every published key, as for logout hints (ADR 0013 (a)).
    keys: VerifyingKeys,
    /// `CAS_ISSUER`, the `iss` a hint must carry.
    issuer: String,
    pool: sqlx::PgPool,
}

impl UpgradeHintService {
    pub fn new(pool: sqlx::PgPool, keys: VerifyingKeys, issuer: impl Into<String>) -> Self {
        Self {
            keys,
            issuer: issuer.into(),
            pool,
        }
    }

    /// The guest a hint presented by `client_id` names, at `now`.
    ///
    /// `Ok(Some(account))` for a valid hint of a guest; `Ok(None)` for a valid
    /// hint of a full account or of an account that no longer exists, which
    /// the caller ignores. A refusal reason is logged at `debug`, without the
    /// token.
    pub async fn guest(
        &self,
        hint: &str,
        client_id: &ClientId,
        now: OffsetDateTime,
    ) -> Result<Option<Account>, HintError> {
        let hint = match tokens::id_token_hint(&self.keys, &self.issuer, hint) {
            Ok(hint) => hint,
            Err(reason) => {
                tracing::debug!(reason = %reason, "id_token_hint refused");
                return Err(HintError::Invalid);
            }
        };
        if hint.client_id != *client_id {
            tracing::debug!(
                client_id = %client_id,
                "id_token_hint refused: issued to another client"
            );
            return Err(HintError::Invalid);
        }
        if hint.is_expired(now) {
            tracing::debug!(client_id = %client_id, "id_token_hint refused: expired");
            return Err(HintError::Expired);
        }

        let account = accounts::get(&self.pool, hint.sub).await?;
        Ok(account.filter(|account| account.r#type == AccountType::Guest))
    }
}

#[cfg(test)]
mod tests {
    use sqlx::PgPool;
    use time::Duration;
    use uuid::Uuid;

    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::clients::Client;
    use crate::oidc::SigningKeys;
    use crate::testing::{
        capture_tracing, display_name, register_public_client, signed_access_token,
        signed_id_token, test_config, test_signing_key, test_signing_keys,
    };

    const CLIENT: &str = "ligretto";

    fn service(pool: &PgPool) -> UpgradeHintService {
        UpgradeHintService::new(
            pool.clone(),
            test_signing_keys().verifying_keys(),
            test_config().issuer,
        )
    }

    async fn guest(pool: &PgPool, client: &Client) -> Account {
        AccountRepository::new(pool.clone())
            .create(NewAccount::guest(client.id.clone(), 1))
            .await
            .unwrap()
    }

    fn hint(client: &Client, account: &Account) -> String {
        signed_id_token(
            &test_signing_key(),
            client,
            account,
            &["openid"],
            OffsetDateTime::now_utc(),
        )
    }

    #[sqlx::test]
    async fn a_fresh_hint_of_a_guest_names_the_guest(pool: PgPool) {
        let client = register_public_client(&pool, CLIENT, &[]).await;
        let guest = guest(&pool, &client).await;

        let found = service(&pool)
            .guest(
                &hint(&client, &guest),
                &client.id,
                OffsetDateTime::now_utc(),
            )
            .await
            .unwrap();

        assert_eq!(found, Some(guest));
    }

    #[sqlx::test]
    async fn a_token_that_is_not_this_clients_id_token_is_invalid(pool: PgPool) {
        let client = register_public_client(&pool, CLIENT, &[]).await;
        let other_client = register_public_client(&pool, "other", &[]).await;
        let guest = guest(&pool, &client).await;
        let now = OffsetDateTime::now_utc();
        let valid = hint(&client, &guest);
        // The signature of another token on this one's header and claims.
        let mut tampered: Vec<&str> = valid.split('.').collect();
        let foreign = hint(&other_client, &guest);
        let foreign_signature = foreign.rsplit('.').next().unwrap();
        tampered[2] = foreign_signature;
        let tampered = tampered.join(".");
        let mut other_issuer = test_config();
        other_issuer.issuer = "https://other.example".to_owned();
        let foreign_issuer = test_signing_key().sign(
            "JWT",
            &serde_json::to_vec(&crate::oidc::IdTokenClaims::new(
                &other_issuer.issuer,
                &client,
                &guest,
                &crate::testing::scopes(&["openid"]),
                None,
                now,
            ))
            .unwrap(),
        );
        let unknown_key = SigningKeys::from_pem(&crate::testing::fresh_signing_key_pem())
            .unwrap()
            .active()
            .clone();
        let access = signed_access_token(&test_signing_key(), &client, &guest, &["openid"], now);

        for (name, token) in [
            ("tampered", tampered),
            ("another issuer", foreign_issuer),
            (
                "an unknown key",
                signed_id_token(&unknown_key, &client, &guest, &["openid"], now),
            ),
            ("an access token", access),
            ("another client's aud", foreign),
            ("not a JWS", "x".to_owned()),
        ] {
            let error = service(&pool)
                .guest(&token, &client.id, now)
                .await
                .unwrap_err();
            assert!(matches!(error, HintError::Invalid), "{name}: {error:?}");
        }
    }

    #[sqlx::test]
    async fn an_expired_hint_is_expired(pool: PgPool) {
        let client = register_public_client(&pool, CLIENT, &[]).await;
        let guest = guest(&pool, &client).await;
        let issued = OffsetDateTime::now_utc() - Duration::minutes(11);
        let hint = signed_id_token(&test_signing_key(), &client, &guest, &["openid"], issued);

        let error = service(&pool)
            .guest(&hint, &client.id, OffsetDateTime::now_utc())
            .await
            .unwrap_err();

        assert!(matches!(error, HintError::Expired), "{error:?}");
    }

    /// A hint of an account that is full, or gone, opens nothing: the caller
    /// ignores it.
    #[sqlx::test]
    async fn a_hint_of_a_full_or_unknown_account_names_no_guest(pool: PgPool) {
        let client = register_public_client(&pool, CLIENT, &[]).await;
        let full = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let mut unknown = full.clone();
        unknown.id = Uuid::new_v4();
        let now = OffsetDateTime::now_utc();

        for account in [&full, &unknown] {
            let found = service(&pool)
                .guest(&hint(&client, account), &client.id, now)
                .await
                .unwrap();
            assert_eq!(found, None);
        }
    }

    /// The type is the row's, not the token's: a guest upgraded since the
    /// token was issued is no guest.
    #[sqlx::test]
    async fn the_account_type_is_read_from_the_row(pool: PgPool) {
        let client = register_public_client(&pool, CLIENT, &[]).await;
        let guest = guest(&pool, &client).await;
        let token = hint(&client, &guest);
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE accounts SET type = 'full' WHERE id = $1")
            .bind(guest.id)
            .execute(&pool)
            .await
            .unwrap();

        let found = service(&pool)
            .guest(&token, &client.id, OffsetDateTime::now_utc())
            .await
            .unwrap();

        assert_eq!(found, None);
    }

    #[sqlx::test]
    async fn the_hint_is_never_logged(pool: PgPool) {
        let client = register_public_client(&pool, CLIENT, &[]).await;
        let guest = guest(&pool, &client).await;
        let issued = OffsetDateTime::now_utc() - Duration::minutes(11);
        let expired = signed_id_token(&test_signing_key(), &client, &guest, &["openid"], issued);
        let (events, _guard) = capture_tracing();

        for token in [expired.as_str(), "garbage.hint.value"] {
            let _ = service(&pool)
                .guest(token, &client.id, OffsetDateTime::now_utc())
                .await;
        }

        assert!(!events.mentioning("id_token_hint refused").is_empty());
        for event in events.all() {
            assert!(!event.contains(&expired), "{event}");
            assert!(!event.contains("garbage.hint.value"), "{event}");
        }
    }
}
