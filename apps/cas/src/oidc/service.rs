//! The authorization code flow on CAS's side: looking up the client a
//! request names, issuing a code for a signed-in account, and redeeming it,
//! once, for the token endpoint (#743). See
//! `docs/adr/0010-authorization-endpoint.md`.

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::AUTHORIZATION_CODE_LIFETIME;
use super::authorization::AuthorizeRequest;
use super::codes::{AuthorizationCode, CodeChallenge};
use super::repository::{self, NewCode, Redemption};
use crate::clients::{Client, ClientId, ClientRepository, Scope};
use crate::sessions::Authenticated;

/// A freshly issued code: the value for the redirect and the row it is
/// stored as. `Debug` shows the id and a redacted code.
#[derive(Debug)]
pub struct IssuedCode {
    pub code: AuthorizationCode,
    pub id: Uuid,
}

/// Why no code was issued.
#[derive(Debug, thiserror::Error)]
pub enum IssueError {
    /// The client is not first-party and would need the account's consent,
    /// which does not exist yet (ADR 0010 (f)).
    #[error("the client needs consent, which is not available yet")]
    ConsentRequired,

    #[error("the operating system refused to provide randomness: {0}")]
    Random(getrandom::Error),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// A consumed code with everything it was bound to: what `/token` checks the
/// verifier against and issues tokens for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedeemedCode {
    pub id: Uuid,
    pub account_id: Uuid,
    pub session_id: Uuid,
    pub client_id: ClientId,
    pub redirect_uri: String,
    pub scopes: Vec<Scope>,
    pub code_challenge: CodeChallenge,
    pub nonce: Option<String>,
}

/// Why a code was not redeemed. `/token` answers every variant but `Db`
/// with `invalid_grant`; they are kept apart so that a replay can revoke
/// what the first redemption produced (RFC 6749 §4.1.2, ADR 0011).
#[derive(Debug, thiserror::Error)]
pub enum RedeemError {
    #[error("no such code")]
    Unknown,

    #[error("the code has expired")]
    Expired,

    /// Never redeemed, and the session that authorized it has ended since:
    /// logout voids the codes it issued (ADR 0011 (d)).
    #[error("the session that authorized the code has ended")]
    SessionEnded,

    /// A replay. `code_id` names the row, so that `/token` can revoke the
    /// grant the first redemption produced.
    #[error("the code was already redeemed")]
    AlreadyRedeemed { code_id: Uuid },

    /// Presented by another client or with another redirect URI. The code is
    /// consumed all the same.
    #[error("the code was issued to another client or redirect URI")]
    Mismatch,

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct AuthorizationService {
    clients: ClientRepository,
    pool: PgPool,
}

impl AuthorizationService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            clients: ClientRepository::new(pool.clone()),
            pool,
        }
    }

    /// The client a request names. `Ok(None)` when there is none.
    pub async fn client(&self, id: &ClientId) -> Result<Option<Client>, sqlx::Error> {
        self.clients.get(id).await
    }

    /// Issues a code for a valid request from a signed-in account. Only a
    /// first-party client gets one: any other would need consent.
    ///
    /// The log line names the row, the client, the account and the session,
    /// never the code: the code is a bearer credential for the next minute.
    pub async fn issue(
        &self,
        request: &AuthorizeRequest,
        client: &Client,
        authenticated: &Authenticated,
    ) -> Result<IssuedCode, IssueError> {
        if !client.first_party {
            return Err(IssueError::ConsentRequired);
        }

        let code = AuthorizationCode::generate().map_err(IssueError::Random)?;
        let id = repository::insert(
            &self.pool,
            NewCode {
                code_hash: &code.hash(),
                client_id: &request.client_id,
                account_id: authenticated.account.id,
                session_id: authenticated.session.id,
                redirect_uri: &request.redirect_uri,
                scopes: &request.scopes,
                code_challenge: &request.code_challenge,
                nonce: request.nonce.as_deref(),
                lifetime: AUTHORIZATION_CODE_LIFETIME,
            },
        )
        .await?;

        tracing::info!(
            code_id = %id,
            client_id = %request.client_id,
            account_id = %authenticated.account.id,
            session_id = %authenticated.session.id,
            "authorization code issued"
        );

        Ok(IssuedCode { code, id })
    }

    /// Consumes a code presented by `client_id` with `redirect_uri`, on
    /// `conn`: the caller owns the transaction, holds the code's row lock
    /// until it ends, and decides whether what it did with the code commits
    /// (ADR 0011 (f)). The binding is checked after the code is consumed, so
    /// a code presented with the wrong client or redirect URI is burnt once
    /// the caller commits: whoever guessed wrong has spent it (RFC 6749
    /// §4.1.3).
    pub async fn redeem(
        &self,
        conn: &mut PgConnection,
        code: &AuthorizationCode,
        client_id: &ClientId,
        redirect_uri: &str,
    ) -> Result<RedeemedCode, RedeemError> {
        let row = match repository::redeem(conn, &code.hash()).await? {
            Redemption::Redeemed(row) => row,
            Redemption::Unknown => return Err(RedeemError::Unknown),
            Redemption::Expired => return Err(RedeemError::Expired),
            Redemption::SessionEnded => return Err(RedeemError::SessionEnded),
            Redemption::AlreadyRedeemed(code_id) => {
                tracing::warn!(
                    code_id = %code_id,
                    client_id = %client_id,
                    "authorization code presented again"
                );
                return Err(RedeemError::AlreadyRedeemed { code_id });
            }
        };

        if row.client_id != *client_id || row.redirect_uri != redirect_uri {
            tracing::warn!(
                code_id = %row.id,
                client_id = %client_id,
                "authorization code presented with another client or redirect URI"
            );
            return Err(RedeemError::Mismatch);
        }

        Ok(RedeemedCode {
            id: row.id,
            account_id: row.account_id,
            session_id: row.session_id,
            client_id: row.client_id,
            redirect_uri: row.redirect_uri,
            scopes: row.scopes,
            code_challenge: row.code_challenge,
            nonce: row.nonce,
        })
    }
}

#[cfg(test)]
mod tests {
    use sqlx::PgPool;

    use super::*;
    use crate::clients::{ClientName, NewClient, RedirectUri};
    use crate::oidc::authorization::Params;
    use crate::oidc::authorization::tests::{CALLBACK, CHALLENGE};
    use crate::oidc::repository::tests::{Fixture, fixture};
    use crate::sessions::SessionService;
    use crate::testing::capture_tracing;

    /// The fixture's session as the handler would have it from the cookie.
    async fn authenticated(pool: &PgPool, fixture: &Fixture) -> Authenticated {
        SessionService::new(pool.clone())
            .authenticate(&fixture.token)
            .await
            .unwrap()
            .expect("the fixture's session is live")
            .0
    }

    fn request(client_id: &str) -> AuthorizeRequest {
        let query = format!(
            "response_type=code&scope=openid%20profile&state=abc&code_challenge={CHALLENGE}\
             &code_challenge_method=S256&nonce=n-0S6"
        );
        let client = test_client(client_id, true);
        AuthorizeRequest::parse(&Params::from_query(&query), &client, CALLBACK).unwrap()
    }

    fn test_client(id: &str, first_party: bool) -> Client {
        Client {
            id: ClientId::try_new(id).unwrap(),
            name: ClientName::try_new("Ligretto").unwrap(),
            kind: crate::clients::ClientKind::Public,
            secret_hash: None,
            redirect_uris: vec![RedirectUri::try_new(CALLBACK).unwrap()],
            post_logout_redirect_uris: vec![],
            first_party,
            guest_login_allowed: false,
            scopes: ["openid", "profile"]
                .map(|scope| Scope::try_new(scope).unwrap())
                .to_vec(),
            audience: crate::clients::Audience::try_new(id).unwrap(),
            created_at: time::OffsetDateTime::UNIX_EPOCH,
        }
    }

    struct Issued {
        service: AuthorizationService,
        issued: IssuedCode,
        client_id: ClientId,
    }

    async fn issue(pool: &PgPool) -> Issued {
        let fixture = fixture(pool).await;
        let service = AuthorizationService::new(pool.clone());
        let client = service.client(&fixture.client_id).await.unwrap().unwrap();
        let authenticated = authenticated(pool, &fixture).await;
        let issued = service
            .issue(&request("ligretto"), &client, &authenticated)
            .await
            .unwrap();
        Issued {
            service,
            issued,
            client_id: fixture.client_id,
        }
    }

    #[sqlx::test]
    async fn issue_stores_the_hash_and_logs_the_row_not_the_code(pool: PgPool) {
        let (events, _guard) = capture_tracing();
        let Issued { issued, .. } = issue(&pool).await;

        // Unchecked query: see docs/TESTS.md.
        let stored: Vec<u8> =
            sqlx::query_scalar("SELECT code_hash FROM authorization_codes WHERE id = $1")
                .bind(issued.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored, issued.code.hash().as_bytes());

        let [line] = &events.mentioning("authorization code issued")[..] else {
            panic!("exactly one line: {:?}", events.all());
        };
        assert!(line.contains(&issued.id.to_string()), "{line}");
        assert!(line.contains("ligretto"), "{line}");
        for event in events.all() {
            assert!(
                !event.contains(issued.code.expose()),
                "the code must never be logged: {event}"
            );
        }
    }

    #[sqlx::test]
    async fn a_client_that_is_not_first_party_gets_no_code(pool: PgPool) {
        let fixture = fixture(&pool).await;
        let service = AuthorizationService::new(pool.clone());
        let authenticated = authenticated(&pool, &fixture).await;

        let error = service
            .issue(
                &request("ligretto"),
                &test_client("ligretto", false),
                &authenticated,
            )
            .await
            .unwrap_err();

        assert!(matches!(error, IssueError::ConsentRequired), "{error:?}");
        // Unchecked query: see docs/TESTS.md.
        let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM authorization_codes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows, 0);
    }

    /// The third acceptance criterion, first half: a code redeems once.
    #[sqlx::test]
    async fn a_code_redeems_once_with_its_client_and_redirect_uri(pool: PgPool) {
        let Issued {
            service,
            issued,
            client_id,
        } = issue(&pool).await;

        let redeemed = service
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &issued.code,
                &client_id,
                CALLBACK,
            )
            .await
            .unwrap();

        assert_eq!(redeemed.id, issued.id);
        assert_eq!(redeemed.client_id, client_id);
        assert_eq!(redeemed.redirect_uri, CALLBACK);
        assert_eq!(redeemed.code_challenge.as_str(), CHALLENGE);
        assert_eq!(redeemed.nonce.as_deref(), Some("n-0S6"));
        assert_eq!(
            redeemed.scopes,
            ["openid", "profile"]
                .map(|scope| Scope::try_new(scope).unwrap())
                .to_vec()
        );

        let again = service
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &issued.code,
                &client_id,
                CALLBACK,
            )
            .await
            .unwrap_err();
        assert!(
            matches!(again, RedeemError::AlreadyRedeemed { code_id } if code_id == issued.id),
            "{again:?}"
        );
    }

    /// Another client presenting the code is refused, and the code is burnt:
    /// the rightful client can no longer use it either.
    #[sqlx::test]
    async fn a_code_from_another_client_is_refused_and_burnt(pool: PgPool) {
        let Issued {
            service,
            issued,
            client_id,
        } = issue(&pool).await;
        ClientRepository::new(pool.clone())
            .create(
                NewClient::public(
                    ClientId::try_new("other").unwrap(),
                    ClientName::try_new("Other").unwrap(),
                    vec![RedirectUri::try_new(CALLBACK).unwrap()],
                )
                .unwrap(),
            )
            .await
            .unwrap();

        let error = service
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &issued.code,
                &ClientId::try_new("other").unwrap(),
                CALLBACK,
            )
            .await
            .unwrap_err();
        assert!(matches!(error, RedeemError::Mismatch), "{error:?}");

        let rightful = service
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &issued.code,
                &client_id,
                CALLBACK,
            )
            .await
            .unwrap_err();
        assert!(
            matches!(rightful, RedeemError::AlreadyRedeemed { .. }),
            "{rightful:?}"
        );
    }

    #[sqlx::test]
    async fn a_code_with_another_redirect_uri_is_refused(pool: PgPool) {
        let Issued {
            service,
            issued,
            client_id,
        } = issue(&pool).await;

        let error = service
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &issued.code,
                &client_id,
                &format!("{CALLBACK}/"),
            )
            .await
            .unwrap_err();

        assert!(matches!(error, RedeemError::Mismatch), "{error:?}");
    }

    #[sqlx::test]
    async fn an_expired_code_is_refused(pool: PgPool) {
        let Issued {
            service,
            issued,
            client_id,
        } = issue(&pool).await;
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("UPDATE authorization_codes SET expires_at = now() - interval '1 second'")
            .execute(&pool)
            .await
            .unwrap();

        let error = service
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &issued.code,
                &client_id,
                CALLBACK,
            )
            .await
            .unwrap_err();

        assert!(matches!(error, RedeemError::Expired), "{error:?}");
    }

    #[sqlx::test]
    async fn a_made_up_code_is_unknown(pool: PgPool) {
        let service = AuthorizationService::new(pool.clone());

        let error = service
            .redeem(
                &mut pool.acquire().await.unwrap(),
                &AuthorizationCode::generate().unwrap(),
                &ClientId::try_new("ligretto").unwrap(),
                CALLBACK,
            )
            .await
            .unwrap_err();

        assert!(matches!(error, RedeemError::Unknown), "{error:?}");
    }
}
