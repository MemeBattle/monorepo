//! RP-initiated logout (OpenID Connect RP-Initiated Logout 1.0): what a
//! logout request is, and the checks it passes before anything is ended or
//! anyone is redirected. The handler ends the session; this decides whether
//! it may, and where the browser goes afterwards. See
//! `docs/adr/0013-userinfo-and-rp-initiated-logout.md`.
//!
//! Every refusal here is a [`PageError`]: until the client and its
//! `post_logout_redirect_uri` are known, nothing may be sent anywhere, as at
//! `/authorize` (ADR 0010 (a)).

use uuid::Uuid;

use super::authorization::{PageError, Params};
use super::keys::VerifyingKeys;
use super::service::AuthorizationService;
use super::tokens;
use crate::clients::ClientId;

/// Every parameter the logout request reads. A repetition of any of them is
/// refused before any other rule. `ui_locales`, `logout_hint` and anything
/// else are ignored, as the specification allows.
const READ_PARAMETERS: [&str; 4] = [
    "id_token_hint",
    "client_id",
    "post_logout_redirect_uri",
    "state",
];

/// A logout request that passed every rule: whose session the client may
/// end, and where the browser goes once it has.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidEndSession {
    /// The client the hint was issued to.
    pub client_id: ClientId,
    /// The hint's `sub`: the only account whose session this request ends.
    pub account_id: Uuid,
    /// Registered for the client, exactly as sent. `None` when the request
    /// named none: the browser goes to CAS's own frontend.
    pub post_logout_redirect_uri: Option<String>,
    /// Echoed on the redirect when it was sent once and not empty.
    pub state: Option<String>,
}

/// Why a logout request was not honoured.
#[derive(Debug, thiserror::Error)]
pub enum EndSessionError {
    /// A request CAS answers with its own page and nothing else.
    #[error("the logout request was refused")]
    Refused(PageError),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl From<PageError> for EndSessionError {
    fn from(error: PageError) -> Self {
        Self::Refused(error)
    }
}

#[derive(Debug, Clone)]
pub struct EndSessionService {
    authorization: AuthorizationService,
    /// Every published key: a hint is honoured for as long as the key that
    /// signed it is published (ADR 0013 (a)).
    keys: VerifyingKeys,
    /// `CAS_ISSUER`, the `iss` a hint must carry.
    issuer: String,
}

impl EndSessionService {
    pub fn new(
        authorization: AuthorizationService,
        keys: VerifyingKeys,
        issuer: impl Into<String>,
    ) -> Self {
        Self {
            authorization,
            keys,
            issuer: issuer.into(),
        }
    }

    /// Applies the rules of ADR 0013 (f) and (g), in order; the first that
    /// fails is the answer, and none of them changes anything:
    ///
    /// 1. no parameter it reads is repeated;
    /// 2. `id_token_hint` is present,
    /// 3. and is an ID token CAS issued (signature, `typ`, `iss`, `aud`),
    ///    expired or not;
    /// 4. `client_id`, if sent, is the hint's `aud`;
    /// 5. that client exists;
    /// 6. `post_logout_redirect_uri`, if sent, is one it registered, byte
    ///    for byte.
    pub async fn validate(&self, params: &Params) -> Result<ValidEndSession, EndSessionError> {
        for name in READ_PARAMETERS {
            params
                .get(name)
                .map_err(|_| PageError::MalformedRequest("a parameter is repeated"))?;
        }
        // Repetition is ruled out above, so every `get` below is `Ok`.
        let param = |name: &'static str| params.get(name).ok().flatten();

        let Some(hint) = param("id_token_hint") else {
            return Err(PageError::MalformedRequest("id_token_hint is required").into());
        };
        let hint = tokens::id_token_hint(&self.keys, &self.issuer, hint).map_err(|reason| {
            tracing::debug!(reason = %reason, "logout hint refused");
            PageError::MalformedRequest("id_token_hint is invalid")
        })?;

        if param("client_id").is_some_and(|client_id| client_id != hint.client_id.as_ref()) {
            return Err(
                PageError::MalformedRequest("client_id does not match id_token_hint").into(),
            );
        }

        let Some(client) = self.authorization.client(&hint.client_id).await? else {
            return Err(PageError::UnknownClient.into());
        };

        let post_logout_redirect_uri = match param("post_logout_redirect_uri") {
            None => None,
            Some(uri) if client.allows_post_logout_redirect_uri(uri) => Some(uri.to_owned()),
            Some(_) => return Err(PageError::InvalidRedirectUri.into()),
        };

        Ok(ValidEndSession {
            client_id: client.id,
            account_id: hint.sub,
            post_logout_redirect_uri,
            state: param("state").map(str::to_owned),
        })
    }
}
