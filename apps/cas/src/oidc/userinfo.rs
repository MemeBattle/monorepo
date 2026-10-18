//! The userinfo use case (OpenID Connect Core §5.3): the claims of the
//! account an access token was issued for, as they are now. The token is
//! verified here against CAS's own published keys; the account is read on
//! every call. See `docs/adr/0013-userinfo-and-rp-initiated-logout.md`.

use time::OffsetDateTime;

use super::OPENID_SCOPE;
use super::keys::VerifyingKeys;
use super::tokens::{self, UserInfoClaims};
use crate::accounts;
use crate::db::Db;

/// Why no claims were answered.
#[derive(Debug, thiserror::Error)]
pub enum UserInfoError {
    /// Not a live access token of this issuer, or one whose account is gone:
    /// RFC 6750 §3.1 `invalid_token`. Why is logged, never answered.
    #[error("the access token is invalid or expired")]
    InvalidToken,

    /// A valid token without `openid`: it was not issued by an OpenID
    /// authorization, and userinfo is an OpenID endpoint (ADR 0013 (b)).
    #[error("the access token does not carry the openid scope")]
    InsufficientScope,

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct UserInfoService {
    db: Db,
    /// Every published key (ADR 0009 (d)): a token signed before a rotation
    /// is honoured until its `exp`.
    keys: VerifyingKeys,
    /// `CAS_ISSUER`, which every token CAS issued carries as `iss`.
    issuer: String,
}

impl UserInfoService {
    pub fn new(db: impl Into<Db>, keys: VerifyingKeys, issuer: impl Into<String>) -> Self {
        Self {
            db: db.into(),
            keys,
            issuer: issuer.into(),
        }
    }

    /// The claims `bearer` releases. Any unexpired access token of this
    /// issuer with `openid` is accepted, whatever its `aud`: userinfo is the
    /// OP's own resource, and the access token the client holds was
    /// audience-restricted to the client's resource server (ADR 0013 (b)).
    /// Revocation of the grant is not consulted: an access token is honoured
    /// until `exp` everywhere (ADR 0011 (a)).
    ///
    /// Userinfo may be polled, so a success is not logged; a refusal is a
    /// `debug` with the reason, never the token.
    pub async fn userinfo(&self, bearer: &str) -> Result<UserInfoClaims, UserInfoError> {
        let token =
            tokens::access_token(&self.keys, &self.issuer, bearer, OffsetDateTime::now_utc())
                .map_err(|reason| {
                    tracing::debug!(reason = %reason, "userinfo token refused");
                    UserInfoError::InvalidToken
                })?;

        if !token
            .scopes
            .iter()
            .any(|scope| scope.as_str() == OPENID_SCOPE)
        {
            tracing::debug!(
                client_id = %token.client_id,
                "userinfo token refused: no openid scope"
            );
            return Err(UserInfoError::InsufficientScope);
        }

        // The token outlived its account: deleting an account ends
        // everything issued for it, and this token is no exception. The
        // connection is acquired here, behind both refusals above: an
        // invalid token is answered without touching the database.
        let mut conn = self.db.acquire().await?;
        let Some(account) = accounts::get(&mut *conn, token.sub).await? else {
            tracing::debug!(
                client_id = %token.client_id,
                "userinfo token refused: the account is gone"
            );
            return Err(UserInfoError::InvalidToken);
        };

        Ok(UserInfoClaims::new(&account, &token.scopes))
    }
}

#[cfg(test)]
mod tests {
    use sqlx::PgPool;

    use super::*;
    use crate::accounts::{AccountRepository, NewAccount};
    use crate::testing::{
        display_name, register_public_client, signed_access_token, test_config, test_signing_key,
        test_signing_keys,
    };

    /// Validation runs before the connection is acquired (ADR 0021): the
    /// service is built on a handle whose single connection the test is
    /// holding, so any acquire would fail. A refusal that still comes back
    /// as its own error is the proof that nothing touched the database.
    #[sqlx::test]
    async fn a_refused_token_never_reaches_the_database(pool: PgPool) {
        let client = register_public_client(&pool, "ligretto", &[]).await;
        let account = AccountRepository::new(pool.clone())
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let without_openid = signed_access_token(
            &test_signing_key(),
            &client,
            &account,
            &["profile"],
            OffsetDateTime::now_utc(),
        );
        let db = Db::connection(pool.acquire().await.unwrap().detach());
        let service = UserInfoService::new(
            db.clone(),
            test_signing_keys().verifying_keys(),
            test_config().issuer,
        );
        // The one connection, held for the whole call.
        let held = db.acquire().await.unwrap();

        let garbage = service.userinfo("not-a-token").await.unwrap_err();
        let insufficient = service.userinfo(&without_openid).await.unwrap_err();

        assert!(
            matches!(garbage, UserInfoError::InvalidToken),
            "{garbage:?}"
        );
        assert!(
            matches!(insufficient, UserInfoError::InsufficientScope),
            "{insufficient:?}"
        );
        // A valid token does reach the database, and finds it taken.
        let with_openid = signed_access_token(
            &test_signing_key(),
            &client,
            &account,
            &["openid"],
            OffsetDateTime::now_utc(),
        );
        let taken = service.userinfo(&with_openid).await.unwrap_err();
        assert!(
            matches!(taken, UserInfoError::Db(sqlx::Error::PoolTimedOut)),
            "{taken:?}"
        );

        drop(held);
        let claims = service.userinfo(&with_openid).await.unwrap();
        assert_eq!(claims.sub, account.id);
    }
}
