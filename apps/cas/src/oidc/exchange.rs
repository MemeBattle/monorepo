//! The token endpoint's use case: exchanging an authorization code for an
//! access token, an ID token and a refresh token, the refresh token under a
//! new grant. The rules are [`super::token_request`]'s; this is where they
//! meet the database, in the order ADR 0011 fixes: the client first, then
//! the grant, then the code, then its verifier. See
//! `docs/adr/0011-token-endpoint-and-access-tokens.md`.

use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use super::authorization::Params;
use super::keys::SigningKey;
use super::repository::{self, NewGrant};
use super::service::{AuthorizationService, RedeemError, RedeemedCode};
use super::token_request::{self, ClientCredentials, CodeGrant, INVALID_CODE, TokenError};
use super::tokens::{
    ACCESS_TOKEN_TYPE, AccessTokenClaims, ID_TOKEN_TYPE, IdTokenClaims, RefreshToken, scope_string,
};
use super::{ACCESS_TOKEN_LIFETIME, REFRESH_TOKEN_LIFETIME};
use crate::accounts::{Account, AccountRepository};
use crate::clients::{Client, ClientKind, Scope};

/// What a successful exchange hands the client: the body of RFC 6749 §5.1.
/// Every field but `expires_in` and `scope` is a bearer credential, so
/// `Debug` shows those two only.
pub struct IssuedTokens {
    pub access_token: String,
    pub id_token: String,
    pub refresh_token: RefreshToken,
    /// Seconds, [`ACCESS_TOKEN_LIFETIME`].
    pub expires_in: u64,
    /// The granted scopes, space-separated.
    pub scope: String,
}

impl std::fmt::Debug for IssuedTokens {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("IssuedTokens")
            .field("expires_in", &self.expires_in)
            .field("scope", &self.scope)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub struct TokenService {
    authorization: AuthorizationService,
    accounts: AccountRepository,
    pool: PgPool,
    /// The active key of the set `http::app` loaded (ADR 0009 (d)).
    signing_key: SigningKey,
    /// `CAS_ISSUER`, the `iss` of every token.
    issuer: String,
}

impl TokenService {
    pub fn new(pool: PgPool, signing_key: SigningKey, issuer: impl Into<String>) -> Self {
        Self {
            authorization: AuthorizationService::new(pool.clone()),
            accounts: AccountRepository::new(pool.clone()),
            pool,
            signing_key,
            issuer: issuer.into(),
        }
    }

    /// Answers a token request: its form parameters and its
    /// `Authorization` header, if it carried exactly one.
    pub async fn exchange(
        &self,
        params: &Params,
        authorization: Option<&[u8]>,
    ) -> Result<IssuedTokens, TokenError> {
        token_request::refuse_repeated(params)?;
        let credentials = token_request::client_credentials(params, authorization)?;
        let client = self.authenticate(&credentials).await?;
        let grant = token_request::code_grant(params)?;
        self.exchange_code(&client, grant).await
    }

    /// The client the credentials prove (RFC 6749 §2.3). A confidential
    /// client must present its secret, a public one must present none: a
    /// secret from a public client is a client that is not what it claims.
    /// Every failure is the same `invalid_client`, the unknown client
    /// included.
    async fn authenticate(&self, credentials: &ClientCredentials) -> Result<Client, TokenError> {
        let client = self.authorization.client(&credentials.client_id).await?;
        let proven = client.filter(|client| match (client.kind, &credentials.secret) {
            (ClientKind::Confidential, Some(secret)) => client.verify_secret(secret),
            (ClientKind::Public, None) => true,
            _ => false,
        });
        proven.ok_or_else(|| {
            tracing::warn!(
                client_id = %credentials.client_id,
                "client authentication failed"
            );
            TokenError::InvalidClient {
                basic: credentials.basic,
            }
        })
    }

    /// Redeems the code for `client`, checks the verifier, and issues the
    /// tokens under a new grant.
    ///
    /// The code is consumed before the verifier is checked, so a wrong
    /// verifier burns it (RFC 7636 §4.6): whoever guessed wrong does not get
    /// a second try. A code presented again revokes whatever its first
    /// redemption produced (RFC 6749 §4.1.2).
    async fn exchange_code(
        &self,
        client: &Client,
        grant: CodeGrant,
    ) -> Result<IssuedTokens, TokenError> {
        let code = match self
            .authorization
            .redeem(&grant.code, &client.id, &grant.redirect_uri)
            .await
        {
            Ok(code) => code,
            Err(RedeemError::AlreadyRedeemed { code_id }) => {
                self.revoke_replayed(code_id).await?;
                return Err(TokenError::InvalidGrant(INVALID_CODE));
            }
            Err(RedeemError::Unknown | RedeemError::Expired | RedeemError::Mismatch) => {
                return Err(TokenError::InvalidGrant(INVALID_CODE));
            }
            Err(RedeemError::Db(error)) => return Err(error.into()),
        };

        if !code.code_challenge.matches(&grant.verifier) {
            tracing::warn!(
                code_id = %code.id,
                client_id = %client.id,
                "code_verifier does not match the code challenge"
            );
            return Err(TokenError::InvalidGrant(
                "code_verifier does not match the code_challenge",
            ));
        }

        // The code's row goes with its account (ON DELETE CASCADE), so a
        // missing account here lost a race with that delete.
        let Some(account) = self.accounts.get(code.account_id).await? else {
            return Err(TokenError::InvalidGrant("the account no longer exists"));
        };

        let refresh_token = RefreshToken::generate().map_err(TokenError::Random)?;
        let grant_id = self.store_grant(&code, &refresh_token).await?;

        tracing::info!(
            grant_id = %grant_id,
            code_id = %code.id,
            client_id = %client.id,
            account_id = %account.id,
            "tokens issued"
        );

        Ok(self.issue(client, &account, &code.scopes, code.nonce, refresh_token))
    }

    /// The grant and its first refresh token, in one transaction: a grant
    /// without a token, or a token without its grant, is never visible.
    async fn store_grant(
        &self,
        code: &RedeemedCode,
        refresh_token: &RefreshToken,
    ) -> Result<Uuid, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let grant_id = repository::insert_grant(
            &mut *tx,
            NewGrant {
                account_id: code.account_id,
                client_id: &code.client_id,
                scopes: &code.scopes,
                authorization_code_id: Some(code.id),
                lifetime: REFRESH_TOKEN_LIFETIME,
            },
        )
        .await?;
        repository::insert_refresh_token(&mut *tx, grant_id, &refresh_token.hash()).await?;
        tx.commit().await?;
        Ok(grant_id)
    }

    /// A replayed code means it leaked, so the grant its first redemption
    /// created may be in the wrong hands: revoke it, and with it every
    /// refresh token it holds. Access tokens already issued run out on their
    /// own, within [`ACCESS_TOKEN_LIFETIME`].
    async fn revoke_replayed(&self, code_id: Uuid) -> Result<(), sqlx::Error> {
        let revoked = repository::revoke_grants_by_code(&self.pool, code_id).await?;
        tracing::warn!(
            code_id = %code_id,
            revoked,
            "grants revoked after an authorization code was replayed"
        );
        Ok(())
    }

    /// Signs the two JWTs. Their times are the process clock, unlike the
    /// rows' (ADR 0011 (e)): they are read by other machines against their
    /// own clocks, and the database has no say in that.
    fn issue(
        &self,
        client: &Client,
        account: &Account,
        scopes: &[Scope],
        nonce: Option<String>,
        refresh_token: RefreshToken,
    ) -> IssuedTokens {
        let now = OffsetDateTime::now_utc();
        let access = AccessTokenClaims::new(&self.issuer, client, account, scopes, now);
        let id = IdTokenClaims::new(&self.issuer, client, account, scopes, nonce, now);
        IssuedTokens {
            access_token: self.signing_key.sign(ACCESS_TOKEN_TYPE, &json(&access)),
            id_token: self.signing_key.sign(ID_TOKEN_TYPE, &json(&id)),
            refresh_token,
            expires_in: ACCESS_TOKEN_LIFETIME.as_secs(),
            scope: scope_string(scopes),
        }
    }
}

/// The claims as JSON. Strings, numbers and uuids always serialise.
fn json(claims: &impl serde::Serialize) -> Vec<u8> {
    serde_json::to_vec(claims).expect("token claims serialise to JSON")
}
