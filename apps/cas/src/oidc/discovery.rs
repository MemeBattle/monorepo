//! The OpenID Provider metadata (OpenID Connect Discovery 1.0 §3) served at
//! `/.well-known/openid-configuration`.

use serde::Serialize;

use super::GUEST_GRANT_TYPE;
use super::keys::SIGNING_ALGORITHM;

/// The discovery document. It advertises the whole SSO milestone, including
/// the endpoints later tickets add, so that it stays the same across their
/// releases (ADR 0009 (f)).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Discovery {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    userinfo_endpoint: String,
    end_session_endpoint: String,
    jwks_uri: String,
    response_types_supported: &'static [&'static str],
    response_modes_supported: &'static [&'static str],
    grant_types_supported: &'static [&'static str],
    subject_types_supported: &'static [&'static str],
    id_token_signing_alg_values_supported: &'static [&'static str],
    scopes_supported: &'static [&'static str],
    token_endpoint_auth_methods_supported: &'static [&'static str],
    code_challenge_methods_supported: &'static [&'static str],
}

impl Discovery {
    /// The document for `issuer`, which config has already checked has no
    /// trailing slash, so every endpoint is `{issuer}/<path>`.
    pub fn for_issuer(issuer: &str) -> Self {
        Self {
            issuer: issuer.to_string(),
            authorization_endpoint: format!("{issuer}/authorize"),
            token_endpoint: format!("{issuer}/token"),
            userinfo_endpoint: format!("{issuer}/userinfo"),
            end_session_endpoint: format!("{issuer}/end_session"),
            jwks_uri: format!("{issuer}/jwks.json"),
            response_types_supported: &["code"],
            response_modes_supported: &["query"],
            grant_types_supported: &["authorization_code", "refresh_token", GUEST_GRANT_TYPE],
            subject_types_supported: &["public"],
            id_token_signing_alg_values_supported: &[SIGNING_ALGORITHM],
            scopes_supported: &["openid", "profile", "email"],
            token_endpoint_auth_methods_supported: &["client_secret_basic", "client_secret_post"],
            code_challenge_methods_supported: &["S256"],
        }
    }

    pub fn issuer(&self) -> &str {
        &self.issuer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_document_holds_exactly_the_advertised_members() {
        let document = serde_json::to_value(Discovery::for_issuer("https://cas.example")).unwrap();

        assert_eq!(
            document,
            serde_json::json!({
                "issuer": "https://cas.example",
                "authorization_endpoint": "https://cas.example/authorize",
                "token_endpoint": "https://cas.example/token",
                "userinfo_endpoint": "https://cas.example/userinfo",
                "end_session_endpoint": "https://cas.example/end_session",
                "jwks_uri": "https://cas.example/jwks.json",
                "response_types_supported": ["code"],
                "response_modes_supported": ["query"],
                "grant_types_supported": [
                    "authorization_code",
                    "refresh_token",
                    "urn:memebattle:oauth:grant-type:guest",
                ],
                "subject_types_supported": ["public"],
                "id_token_signing_alg_values_supported": ["ES256"],
                "scopes_supported": ["openid", "profile", "email"],
                "token_endpoint_auth_methods_supported": [
                    "client_secret_basic",
                    "client_secret_post",
                ],
                "code_challenge_methods_supported": ["S256"],
            })
        );
    }
}
