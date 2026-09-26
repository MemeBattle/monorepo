//! The token endpoint's use case: exchanging an authorization code for an
//! access token, an ID token and a refresh token, the refresh token under a
//! new grant. The rules are [`super::token_request`]'s; this is where they
//! meet the database, in the order ADR 0011 fixes: the client first, then
//! the grant, then the code, then its verifier, the last two and the new
//! grant in one transaction. See
//! `docs/adr/0011-token-endpoint-and-access-tokens.md`.

use sqlx::{PgConnection, PgPool};
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
use crate::accounts::{self, Account};
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
    /// tokens under a new grant: one transaction from the redemption to the
    /// grant, holding the code's row lock throughout (ADR 0011 (f)).
    ///
    /// The transaction commits whenever the database did not fail, refusals
    /// included. A code presented with the wrong verifier, client or redirect
    /// URI stays consumed (RFC 7636 §4.6, RFC 6749 §4.1.3): whoever guessed
    /// wrong does not get a second try. A code presented again commits the
    /// revocation of what its first redemption produced (RFC 6749 §4.1.2).
    /// A database failure rolls everything back, and the code is as it was.
    ///
    /// Because the lock is held until the grant is committed, a replay that
    /// races this exchange waits for it and then finds its grant: the
    /// revocation cannot run before there is something to revoke.
    async fn exchange_code(
        &self,
        client: &Client,
        grant: CodeGrant,
    ) -> Result<IssuedTokens, TokenError> {
        // Drawn before the transaction, so that a failure here consumes
        // nothing.
        let refresh_token = RefreshToken::generate().map_err(TokenError::Random)?;

        let mut tx = self.pool.begin().await?;
        let granted = match self
            .redeem_into_grant(&mut tx, client, &grant, &refresh_token)
            .await
        {
            // Returning drops the transaction, which rolls it back.
            Err(error @ TokenError::Db(_)) => return Err(error),
            outcome => {
                tx.commit().await?;
                outcome?
            }
        };
        let Granted {
            code,
            account,
            grant_id,
        } = granted;

        tracing::info!(
            grant_id = %grant_id,
            code_id = %code.id,
            client_id = %client.id,
            account_id = %account.id,
            "tokens issued"
        );

        Ok(self.issue(client, &account, &code.scopes, code.nonce, refresh_token))
    }

    /// Everything [`Self::exchange_code`] does on its transaction: the
    /// redemption, the checks after it, and the grant with its first refresh
    /// token, or the revocation a replay calls for.
    async fn redeem_into_grant(
        &self,
        conn: &mut PgConnection,
        client: &Client,
        grant: &CodeGrant,
        refresh_token: &RefreshToken,
    ) -> Result<Granted, TokenError> {
        let code = match self
            .authorization
            .redeem(&mut *conn, &grant.code, &client.id, &grant.redirect_uri)
            .await
        {
            Ok(code) => code,
            Err(RedeemError::AlreadyRedeemed { code_id }) => {
                revoke_replayed(conn, code_id).await?;
                return Err(TokenError::InvalidGrant(INVALID_CODE));
            }
            Err(
                RedeemError::Unknown
                | RedeemError::Expired
                | RedeemError::SessionEnded
                | RedeemError::Mismatch,
            ) => {
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

        // The code's row goes with its account (ON DELETE CASCADE), and this
        // transaction holds its lock, so the account cannot vanish in
        // between; the check keeps that an invariant rather than an unwrap.
        let Some(account) = accounts::get(&mut *conn, code.account_id).await? else {
            return Err(TokenError::InvalidGrant("the account no longer exists"));
        };

        let grant_id = store_grant(conn, &code, refresh_token).await?;
        Ok(Granted {
            code,
            account,
            grant_id,
        })
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

/// What a successful redemption produced, for the tokens to be signed
/// once it has committed.
struct Granted {
    code: RedeemedCode,
    account: Account,
    grant_id: Uuid,
}

/// The grant and its first refresh token, on the exchange's transaction: a
/// grant without a token, or a token without its grant, is never visible.
async fn store_grant(
    conn: &mut PgConnection,
    code: &RedeemedCode,
    refresh_token: &RefreshToken,
) -> Result<Uuid, sqlx::Error> {
    let grant_id = repository::insert_grant(
        &mut *conn,
        NewGrant {
            account_id: code.account_id,
            client_id: &code.client_id,
            scopes: &code.scopes,
            authorization_code_id: Some(code.id),
            lifetime: REFRESH_TOKEN_LIFETIME,
        },
    )
    .await?;
    repository::insert_refresh_token(&mut *conn, grant_id, &refresh_token.hash()).await?;
    Ok(grant_id)
}

/// A replayed code means it leaked, so the grant its first redemption
/// created may be in the wrong hands: revoke it, and with it every refresh
/// token it holds. Access tokens already issued run out on their own, within
/// [`ACCESS_TOKEN_LIFETIME`]. The first redemption has committed by the time
/// this runs (its row lock is what the replay waited on), so its grant is
/// there to be found.
async fn revoke_replayed(conn: &mut PgConnection, code_id: Uuid) -> Result<(), sqlx::Error> {
    let revoked = repository::revoke_grants_by_code(conn, code_id).await?;
    tracing::warn!(
        code_id = %code_id,
        revoked,
        "grants revoked after an authorization code was replayed"
    );
    Ok(())
}

/// The claims as JSON. Strings, numbers and uuids always serialise.
fn json(claims: &impl serde::Serialize) -> Vec<u8> {
    serde_json::to_vec(claims).expect("token claims serialise to JSON")
}
