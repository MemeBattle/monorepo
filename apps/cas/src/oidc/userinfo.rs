//! The userinfo use case (OpenID Connect Core §5.3): the claims of the
//! account an access token was issued for, as they are now. The token is
//! verified here against CAS's own published keys; the account is read on
//! every call. See `docs/adr/0013-userinfo-and-rp-initiated-logout.md`.

use sqlx::PgPool;
use time::OffsetDateTime;

use super::OPENID_SCOPE;
use super::keys::VerifyingKeys;
use super::tokens::{self, UserInfoClaims};
use crate::accounts;

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
    pool: PgPool,
    /// Every published key (ADR 0009 (d)): a token signed before a rotation
    /// is honoured until its `exp`.
    keys: VerifyingKeys,
    /// `CAS_ISSUER`, which every token CAS issued carries as `iss`.
    issuer: String,
}

impl UserInfoService {
    pub fn new(pool: PgPool, keys: VerifyingKeys, issuer: impl Into<String>) -> Self {
        Self {
            pool,
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
        // everything issued for it, and this token is no exception.
        let Some(account) = accounts::get(&self.pool, token.sub).await? else {
            tracing::debug!(
                client_id = %token.client_id,
                "userinfo token refused: the account is gone"
            );
            return Err(UserInfoError::InvalidToken);
        };

        Ok(UserInfoClaims::new(&account, &token.scopes))
    }
}
