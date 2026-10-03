//! The token endpoint's use cases: exchanging an authorization code for an
//! access token, an ID token and a refresh token, the refresh token under a
//! new grant; and refreshing, which retires the presented refresh token and
//! issues the set again with its successor under the same grant. The rules
//! are [`super::token_request`]'s; this is where they meet the database, in
//! the order ADR 0011 fixes: the client first, then the grant, then the code,
//! then its verifier, the last two and the new grant in one transaction. A
//! refresh locks the grant and its token, checks them, and rotates in one
//! transaction (ADR 0012). The guest grant mints a guest account and a grant
//! for it, under the client's lock and within its limit, in one transaction
//! (ADR 0014). See `docs/adr/0011-token-endpoint-and-access-tokens.md`,
//! `docs/adr/0012-refresh-token-rotation.md` and
//! `docs/adr/0014-guest-accounts-and-the-guest-grant.md`.

use sqlx::{PgConnection, PgPool};
use time::OffsetDateTime;
use uuid::Uuid;

use super::authorization::Params;
use super::keys::SigningKey;
use super::repository::{self, NewGrant, Presented};
use super::service::{AuthorizationService, RedeemError, RedeemedCode};
use super::token_request::{
    self, ClientCredentials, CodeGrant, Grant, GuestGrant, INVALID_CODE, INVALID_REFRESH_TOKEN,
    RefreshGrant, TokenError,
};
use super::tokens::{
    ACCESS_TOKEN_TYPE, AccessTokenClaims, ID_TOKEN_TYPE, IdTokenClaims, RefreshToken, scope_string,
};
use super::{ACCESS_TOKEN_LIFETIME, GUEST_GRANT_RATE_WINDOW, REFRESH_TOKEN_LIFETIME};
use crate::accounts::{self, Account, NewAccount};
use crate::clients::{self, Client, ClientKind, Scope};

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
        match token_request::grant(params)? {
            Grant::Code(grant) => self.exchange_code(&client, grant).await,
            Grant::Refresh(grant) => self.refresh(&client, grant).await,
            Grant::Guest(grant) => self.mint_guest(&client, grant).await,
        }
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

    /// Rotates the presented refresh token of `client` and issues a new set:
    /// one transaction that locks the grant and the token, checks them,
    /// retires the token and inserts its successor under the same grant,
    /// with the grant's unchanged expiry (ADR 0012 (b)).
    ///
    /// The transaction commits whenever the database did not fail, refusals
    /// included, so that the revocation a reused token calls for is kept. A
    /// database failure rolls everything back, and the token is as it was.
    async fn refresh(
        &self,
        client: &Client,
        grant: RefreshGrant,
    ) -> Result<IssuedTokens, TokenError> {
        // Drawn before the transaction, so that a failure here spends
        // nothing.
        let successor = RefreshToken::generate().map_err(TokenError::Random)?;

        let mut tx = self.pool.begin().await?;
        let rotated = match rotate(&mut tx, client, &grant, &successor).await {
            // Returning drops the transaction, which rolls it back.
            Err(error @ TokenError::Db(_)) => return Err(error),
            outcome => {
                tx.commit().await?;
                outcome?
            }
        };
        let Rotated {
            account,
            scopes,
            grant_id,
        } = rotated;

        tracing::info!(
            grant_id = %grant_id,
            client_id = %client.id,
            account_id = %account.id,
            "tokens refreshed"
        );

        // A refresh has no authorization request, so no nonce (OpenID
        // Connect Core §12.2); the account's claims are read afresh.
        Ok(self.issue(client, &account, &scopes, None, successor))
    }

    /// Mints a guest account for `client` and issues the tokens under a new
    /// grant for it (ADR 0014). No authorization request, no code, no CAS
    /// session: the application's backend asks, and the guest never sees
    /// CAS.
    ///
    /// Only a confidential client with `guest_login_allowed` may: a public
    /// client cannot prove who it is, so the flag would be an open tap for
    /// accounts. That is checked here, after the client authenticated (ADR
    /// 0011 (f)) and before anything of the grant is read or written. Then
    /// the scope, then one transaction: the client's lock, the count, the
    /// account, the grant and its first refresh token. A refusal writes
    /// nothing; a database failure rolls everything back.
    async fn mint_guest(
        &self,
        client: &Client,
        grant: GuestGrant,
    ) -> Result<IssuedTokens, TokenError> {
        if client.kind != ClientKind::Confidential || !client.guest_login_allowed {
            tracing::warn!(
                client_id = %client.id,
                kind = client.kind.as_str(),
                guest_login_allowed = client.guest_login_allowed,
                "guest grant refused to a client not allowed to use it"
            );
            return Err(TokenError::UnauthorizedClient);
        }
        let scopes = token_request::guest_scopes(grant.scope.as_deref(), client)?;

        // Drawn before the transaction, as for the other grants, so that a
        // failure here writes nothing.
        let refresh_token = RefreshToken::generate().map_err(TokenError::Random)?;

        let mut tx = self.pool.begin().await?;
        // Returning early drops the transaction, which rolls it back.
        let (account, grant_id) = mint(&mut tx, client, &scopes, &refresh_token).await?;
        tx.commit().await?;

        tracing::info!(
            grant_id = %grant_id,
            client_id = %client.id,
            account_id = %account.id,
            "guest account created"
        );

        // No authorization request, so no nonce.
        Ok(self.issue(client, &account, &scopes, None, refresh_token))
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

/// What a successful rotation produced, for the tokens to be signed once it
/// has committed.
struct Rotated {
    account: Account,
    /// The grant's scopes, all of them, whatever the request asked for
    /// (ADR 0012 (c)).
    scopes: Vec<Scope>,
    grant_id: Uuid,
}

/// Everything [`TokenService::refresh`] does on its transaction: the lookup
/// that locks the grant and the token, the checks, and the rotation, or the
/// revocation a reused token calls for.
///
/// The checks run before anything is written: a token presented by another
/// client, or with a scope the grant does not hold, is refused and left as
/// it was (ADR 0012 (c), (d)). A retired token revokes its grant whoever
/// presents it, since it has leaked either way.
async fn rotate(
    conn: &mut PgConnection,
    client: &Client,
    grant: &RefreshGrant,
    successor: &RefreshToken,
) -> Result<Rotated, TokenError> {
    let token =
        match repository::lock_refresh_token(&mut *conn, &grant.refresh_token.hash()).await? {
            Presented::Live(token) => token,
            Presented::Unknown | Presented::Expired | Presented::Revoked { .. } => {
                return Err(TokenError::InvalidGrant(INVALID_REFRESH_TOKEN));
            }
            Presented::AlreadyUsed { grant_id } => {
                let revoked = repository::revoke_grant(&mut *conn, grant_id).await?;
                tracing::warn!(
                    grant_id = %grant_id,
                    client_id = %client.id,
                    revoked,
                    "refresh token reused, grant revoked"
                );
                return Err(TokenError::InvalidGrant(INVALID_REFRESH_TOKEN));
            }
        };

    if token.client_id != client.id {
        tracing::warn!(
            grant_id = %token.grant_id,
            client_id = %client.id,
            "refresh token presented by another client"
        );
        return Err(TokenError::InvalidGrant(INVALID_REFRESH_TOKEN));
    }

    let exceeds = |requested: &Vec<Scope>| !requested.iter().all(|s| token.scopes.contains(s));
    if grant.scope.as_ref().is_some_and(exceeds) {
        return Err(TokenError::InvalidScope(
            "the requested scope exceeds the scope of the grant",
        ));
    }

    // The grant goes with its account (ON DELETE CASCADE), and this
    // transaction holds the grant's lock, so the account cannot vanish in
    // between; the check keeps that an invariant rather than an unwrap.
    let Some(account) = accounts::get(&mut *conn, token.account_id).await? else {
        return Err(TokenError::InvalidGrant(INVALID_REFRESH_TOKEN));
    };

    repository::retire_refresh_token(&mut *conn, token.token_id).await?;
    repository::touch_grant(&mut *conn, token.grant_id).await?;
    repository::insert_refresh_token(&mut *conn, token.grant_id, &successor.hash()).await?;

    Ok(Rotated {
        account,
        scopes: token.scopes,
        grant_id: token.grant_id,
    })
}

/// Everything [`TokenService::mint_guest`] does on its transaction.
///
/// The client's row is locked first, in a statement of its own, and held to
/// the commit: guest mints of one client are serialised across every
/// replica, so the count sees every account a mint before this one
/// committed, and the limit is exact (ADR 0014 (e)). The count's cutoff and
/// the account's `created_at` are read by the statements after the lock,
/// from `statement_timestamp()`: a mint that waited for the lock counts the
/// real last minute and stamps its account with the moment it wrote it.
///
/// The lock is the client row first, then only rows this transaction
/// creates, so there is nothing to deadlock with; it is `FOR NO KEY
/// UPDATE`, so the client's code exchanges and refreshes are not queued
/// behind it.
async fn mint(
    conn: &mut PgConnection,
    client: &Client,
    scopes: &[Scope],
    refresh_token: &RefreshToken,
) -> Result<(Account, Uuid), TokenError> {
    // The client authenticated a moment ago; `None` means it was deleted
    // since, and it is no more authorized than an unknown one.
    let Some(limit) = clients::lock_guest_grant_limit(&mut *conn, &client.id).await? else {
        return Err(TokenError::UnauthorizedClient);
    };
    let minted =
        accounts::count_created_by_client(&mut *conn, &client.id, GUEST_GRANT_RATE_WINDOW).await?;
    if minted >= i64::from(i32::from(limit)) {
        tracing::warn!(
            client_id = %client.id,
            minted,
            limit = %limit,
            "guest grant rate limit exceeded"
        );
        return Err(TokenError::RateLimited {
            retry_after: GUEST_GRANT_RATE_WINDOW,
        });
    }

    let account = accounts::insert(&mut *conn, NewAccount::guest(client.id.clone())).await?;
    let grant_id = repository::insert_grant(
        &mut *conn,
        NewGrant {
            account_id: account.id,
            client_id: &client.id,
            scopes,
            authorization_code_id: None,
            lifetime: REFRESH_TOKEN_LIFETIME,
        },
    )
    .await?;
    repository::insert_refresh_token(&mut *conn, grant_id, &refresh_token.hash()).await?;
    Ok((account, grant_id))
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
