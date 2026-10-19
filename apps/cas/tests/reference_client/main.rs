//! The reference client: proof that an ordinary OpenID Connect relying party
//! can use CAS knowing only the issuer and its own registration (#750).
//!
//! Each test serves the real `cas::http::app` on a TCP port of its own,
//! against a throwaway database, and drives it over HTTP: the relying party
//! with the `openidconnect` crate and its reqwest client, the user's browser
//! with a plain HTTP client and the software authenticator.
//!
//! The rule: everything OIDC comes from the discovery document. The relying
//! party is configured by `openidconnect`'s own discovery, so every endpoint
//! it calls and every algorithm it accepts is the document's, and a server
//! that does not do what the document says fails here. The only hard-coded
//! paths are CAS's own `/api`, where the test plays the cas-frontend, not
//! the relying party. The other direction — the document advertising
//! something this suite does not exercise — is
//! `the_discovery_document_is_what_the_reference_client_exercises`. See
//! `docs/TESTS.md`.

#[path = "../../src/testing/soft_passkey.rs"]
mod soft_passkey;

mod browser;
mod cas;
mod relying_party;

use std::collections::BTreeSet;

use ::cas::clients::{
    Audience, ClientId, ClientKind, ClientName, RedirectUri, Registration, Scope,
};
use openidconnect::core::{CoreClientAuthMethod, CoreIdTokenClaims};
use openidconnect::{AuthType, CsrfToken, OAuth2TokenResponse};
use serde_json::Value;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

use crate::browser::{Browser, return_to};
use crate::cas::Cas;
use crate::relying_party::{
    RelyingParty, discover, extra_claims, http_client, id_token, is_invalid_grant,
    verify_access_token,
};

/// Nobody listens here: the browser reads the `Location` CAS sends it to
/// and never follows it.
const CALLBACK: &str = "https://rp.example/callback";
const SIGNED_OUT: &str = "https://rp.example/signed-out";
/// The resource server the confidential client's access tokens are for.
const AUDIENCE: &str = "reference-api";

/// A first-party client (consent does not exist yet, so CAS authorizes no
/// other kind) allowed `openid profile email`.
fn registration(id: &str, kind: ClientKind, redirect_uri: &str) -> Registration {
    Registration {
        id: ClientId::try_new(id).expect("a valid client id"),
        name: ClientName::try_new("Reference client").expect("a valid client name"),
        kind,
        redirect_uris: vec![RedirectUri::try_new(redirect_uri).expect("a valid redirect URI")],
        post_logout_redirect_uris: Vec::new(),
        first_party: true,
        guest_login_allowed: false,
        guest_grants_per_minute: None,
        scopes: ["openid", "profile", "email"]
            .into_iter()
            .map(|scope| Scope::try_new(scope).expect("a valid scope"))
            .collect(),
        audience: None,
    }
}

fn name(claims: &CoreIdTokenClaims) -> Option<&str> {
    claims
        .name()
        .and_then(|name| name.get(None))
        .map(|name| name.as_str())
}

fn set<'a>(values: impl IntoIterator<Item = &'a str>) -> BTreeSet<&'a str> {
    values.into_iter().collect()
}

/// A browser with an account signed in, for the tests about the protocol
/// rather than the sign-in.
async fn signed_in_browser(cas: &Cas) -> Browser {
    let mut browser = Browser::new(cas);
    browser.create_account("Ada").await;
    assert!(browser.is_signed_in().await);
    browser
}

#[sqlx::test]
async fn a_confidential_relying_party_signs_in_reads_userinfo_refreshes_and_logs_out(
    _: PgPoolOptions,
    options: PgConnectOptions,
) {
    let cas = Cas::start(&options).await;
    let registered = cas
        .register(Registration {
            post_logout_redirect_uris: vec![RedirectUri::try_new(SIGNED_OUT).unwrap()],
            audience: Some(Audience::try_new(AUDIENCE).unwrap()),
            ..registration("reference-app", ClientKind::Confidential, CALLBACK)
        })
        .await;
    let secret = registered
        .secret
        .expect("a confidential client has a secret");
    let metadata = discover(&http_client(), cas.issuer()).await;
    let rp = RelyingParty::new(
        &metadata,
        "reference-app",
        Some(secret.expose()),
        AuthType::BasicAuth,
        CALLBACK,
    );
    let mut browser = Browser::new(&cas);

    // Sign-in: CAS sends the anonymous browser to the frontend, which
    // creates the account and returns to the request.
    let request = rp.authorize(&["profile", "email"]);
    let sign_in = browser.visit(&request.url).await.redirect().clone();
    browser.create_account("Ada").await;
    browser.set_email("ada@example.com").await;
    let callback = browser.follow_return_to(&sign_in, "/sign-in").await;
    let code = rp.callback(callback.redirect(), &request.state);

    // The code exchange and the ID token.
    let tokens = rp.exchange(code, request.verifier).await;
    let claims = rp.claims(&tokens, Some(&request.nonce));
    assert_eq!(name(&claims), Some("Ada"));
    assert_eq!(
        claims.email().map(|email| email.as_str()),
        Some("ada@example.com")
    );
    let granted = tokens.scopes().expect("the response states the scopes");
    assert_eq!(
        set(granted.iter().map(|scope| scope.as_str())),
        set(["openid", "profile", "email"])
    );

    // The access token, as the client's resource server checks it.
    let access = verify_access_token(&metadata, tokens.access_token(), AUDIENCE);
    assert_eq!(access["sub"], claims.subject().as_str());

    // Userinfo.
    let userinfo = rp.userinfo(tokens.access_token(), &claims).await;
    assert_eq!(userinfo.subject(), claims.subject());
    assert_eq!(
        userinfo
            .name()
            .and_then(|name| name.get(None))
            .map(|name| name.as_str()),
        Some("Ada")
    );
    assert_eq!(
        userinfo.email().map(|email| email.as_str()),
        Some("ada@example.com")
    );

    // Refresh: a new refresh token, a new ID token for the same subject.
    let refresh_token = tokens.refresh_token().expect("a refresh token");
    let refreshed = rp
        .refresh(refresh_token)
        .await
        .expect("the refresh succeeds");
    let rotated = refreshed.refresh_token().expect("a rotated refresh token");
    assert_ne!(rotated.secret(), refresh_token.secret());
    let refreshed_claims = rp.claims(&refreshed, None);
    assert_eq!(refreshed_claims.subject(), claims.subject());
    let userinfo = rp
        .userinfo(refreshed.access_token(), &refreshed_claims)
        .await;
    assert_eq!(userinfo.subject(), claims.subject());

    // RP-initiated logout.
    let state = CsrfToken::new_random();
    let logout = rp.logout_url(id_token(&refreshed), SIGNED_OUT, &state);
    let signed_out = browser.visit(&logout).await.redirect().clone();
    let mut back = signed_out.clone();
    back.set_query(None);
    assert_eq!(back.as_str(), SIGNED_OUT);
    assert!(
        signed_out
            .query_pairs()
            .any(|(name, value)| name == "state" && value == state.secret().as_str()),
        "{signed_out} echoes the state"
    );
    assert!(!browser.is_signed_in().await);
    let again = rp.authorize(&["profile", "email"]);
    let location = browser.visit(&again.url).await.redirect().clone();
    return_to(&location, "/sign-in");

    drop((browser, rp));
    cas.stop().await;
}

#[sqlx::test]
async fn a_guest_upgrades_through_id_token_hint_and_keeps_its_sub(
    _: PgPoolOptions,
    options: PgConnectOptions,
) {
    let cas = Cas::start(&options).await;
    let registered = cas
        .register(Registration {
            guest_login_allowed: true,
            ..registration("reference-app", ClientKind::Confidential, CALLBACK)
        })
        .await;
    let secret = registered
        .secret
        .expect("a confidential client has a secret");
    let metadata = discover(&http_client(), cas.issuer()).await;
    let rp = RelyingParty::new(
        &metadata,
        "reference-app",
        Some(secret.expose()),
        AuthType::BasicAuth,
        CALLBACK,
    );

    // The guest grant.
    let guest = rp.guest().await;
    let guest_claims = rp.claims(&guest, None);
    assert_eq!(
        extra_claims(&id_token(&guest).to_string())["account_type"],
        "guest"
    );
    assert_eq!(name(&guest_claims), None);

    // The upgrade: the hint sends the anonymous browser to create-account
    // under an upgrade session, without the hint in return_to.
    let mut browser = Browser::new(&cas);
    let request = rp.authorize_with(&["profile"], |request| {
        request.set_id_token_hint(id_token(&guest))
    });
    let create_account = browser.visit(&request.url).await.redirect().clone();
    let back_to = return_to(&create_account, "/create-account");
    assert!(!back_to.contains("id_token_hint"), "{back_to}");
    assert!(browser.holds_cookie(), "an upgrade session was opened");
    browser.create_account("Ada").await;
    let callback = browser
        .follow_return_to(&create_account, "/create-account")
        .await;
    let code = rp.callback(callback.redirect(), &request.state);

    // The same subject, now a full account.
    let tokens = rp.exchange(code, request.verifier).await;
    let claims = rp.claims(&tokens, Some(&request.nonce));
    assert_eq!(claims.subject(), guest_claims.subject());
    assert_eq!(
        extra_claims(&id_token(&tokens).to_string())["account_type"],
        "full"
    );
    assert_eq!(name(&claims), Some("Ada"));
    let userinfo = rp.userinfo(tokens.access_token(), &claims).await;
    assert_eq!(userinfo.subject(), guest_claims.subject());
    assert_eq!(
        userinfo
            .name()
            .and_then(|name| name.get(None))
            .map(|name| name.as_str()),
        Some("Ada")
    );

    // The guest's grants were revoked by the upgrade (ADR 0015 (f)): what a
    // relying party must expect from its old refresh token.
    let error = rp
        .refresh(
            guest
                .refresh_token()
                .expect("the guest has a refresh token"),
        )
        .await
        .expect_err("the guest's refresh token is revoked");
    assert!(is_invalid_grant(&error), "{error:?}");

    drop((browser, rp));
    cas.stop().await;
}

#[sqlx::test]
async fn every_advertised_token_endpoint_auth_method_authenticates(
    _: PgPoolOptions,
    options: PgConnectOptions,
) {
    let cas = Cas::start(&options).await;
    let metadata = discover(&http_client(), cas.issuer()).await;
    let mut browser = signed_in_browser(&cas).await;

    let methods = metadata
        .token_endpoint_auth_methods_supported()
        .expect("the document lists its auth methods");
    let mut subjects = Vec::new();
    for method in methods {
        // Each client on a host of its own: pairwise subjects may be shared
        // within one sector (OpenID Connect Core §8.1), so only clients of
        // different hosts tell `public` from `pairwise`.
        let (id, kind, auth_type, callback) = match method {
            CoreClientAuthMethod::ClientSecretBasic => (
                "reference-basic",
                ClientKind::Confidential,
                AuthType::BasicAuth,
                "https://rp-basic.example/callback",
            ),
            CoreClientAuthMethod::ClientSecretPost => (
                "reference-post",
                ClientKind::Confidential,
                AuthType::RequestBody,
                "https://rp-post.example/callback",
            ),
            CoreClientAuthMethod::None => (
                "reference-public",
                ClientKind::Public,
                AuthType::BasicAuth,
                "https://rp-public.example/callback",
            ),
            other => panic!(
                "the document advertises {other:?}: extend the reference client to \
                 authenticate with it, then add it here"
            ),
        };
        let registered = cas.register(registration(id, kind, callback)).await;
        let secret = registered.secret.as_ref().map(|secret| secret.expose());
        let rp = RelyingParty::new(&metadata, id, secret, auth_type, callback);

        let request = rp.authorize(&["profile"]);
        let location = browser.visit(&request.url).await.redirect().clone();
        let code = rp.callback(&location, &request.state);
        let tokens = rp.exchange(code, request.verifier).await;
        let claims = rp.claims(&tokens, Some(&request.nonce));
        subjects.push(claims.subject().to_string());
    }

    assert_eq!(subjects.len(), methods.len());
    // `subject_types_supported: ["public"]`: one subject for every client.
    assert!(
        subjects.windows(2).all(|pair| pair[0] == pair[1]),
        "{subjects:?}"
    );

    drop(browser);
    cas.stop().await;
}

/// The members of the discovery document this suite exercises. A member
/// added to the document fails here until the reference client exercises it.
const EXERCISED_MEMBERS: [&str; 15] = [
    "issuer",
    "authorization_endpoint",
    "token_endpoint",
    "userinfo_endpoint",
    "end_session_endpoint",
    "jwks_uri",
    "response_types_supported",
    "response_modes_supported",
    "grant_types_supported",
    "subject_types_supported",
    "id_token_signing_alg_values_supported",
    "scopes_supported",
    "token_endpoint_auth_methods_supported",
    "code_challenge_methods_supported",
    "request_uri_parameter_supported",
];

/// The list-valued members and the values this suite exercises, each
/// against the test that does.
const EXERCISED_VALUES: [(&str, &[&str]); 8] = [
    // Every request of the suite is `response_type=code` (the library's
    // `AuthorizationCode` flow).
    ("response_types_supported", &["code"]),
    // Asked for by name below, and by default everywhere else.
    ("response_modes_supported", &["query"]),
    // The code and refresh grants in the first test, the guest grant in the
    // second.
    (
        "grant_types_supported",
        &[
            "authorization_code",
            "refresh_token",
            relying_party::GUEST_GRANT_TYPE,
        ],
    ),
    // `every_advertised_token_endpoint_auth_method_authenticates`.
    ("subject_types_supported", &["public"]),
    // The algorithm every ID token and access token is verified with.
    ("id_token_signing_alg_values_supported", &["ES256"]),
    // Requested and released in the first test.
    ("scopes_supported", &["openid", "profile", "email"]),
    // `every_advertised_token_endpoint_auth_method_authenticates`.
    (
        "token_endpoint_auth_methods_supported",
        &["client_secret_basic", "client_secret_post", "none"],
    ),
    // The method of the library's `PkceCodeChallenge::new_random_sha256`.
    ("code_challenge_methods_supported", &["S256"]),
];

const EXTEND: &str = "extend the reference client to exercise it, then add it here";

#[sqlx::test]
async fn the_discovery_document_is_what_the_reference_client_exercises(
    _: PgPoolOptions,
    options: PgConnectOptions,
) {
    let cas = Cas::start(&options).await;
    let http = http_client();
    let response = http
        .get(format!("{}/.well-known/openid-configuration", cas.issuer()))
        .send()
        .await
        .expect("CAS answers");
    let document: Value = serde_json::from_slice(&response.bytes().await.expect("a readable body"))
        .expect("a JSON document");
    let object = document.as_object().expect("the document is an object");

    let members = set(object.keys().map(String::as_str));
    let exercised = set(EXERCISED_MEMBERS);
    assert_eq!(
        members, exercised,
        "the document's members differ from those the reference client exercises: {EXTEND}"
    );

    for (member, values) in EXERCISED_VALUES {
        let advertised = set(document[member]
            .as_array()
            .unwrap_or_else(|| panic!("{member} is a list"))
            .iter()
            .map(|value| value.as_str().expect("a string value")));
        assert_eq!(
            advertised,
            set(values.iter().copied()),
            "{member} differs from what the reference client exercises: {EXTEND}"
        );
    }

    assert_eq!(document["issuer"], cas.issuer());
    for endpoint in [
        "authorization_endpoint",
        "token_endpoint",
        "userinfo_endpoint",
        "end_session_endpoint",
        "jwks_uri",
    ] {
        let url = document[endpoint].as_str().expect("an endpoint URL");
        assert!(
            url.starts_with(&format!("{}/", cas.issuer())),
            "{endpoint} {url} is under the issuer"
        );
    }

    let registered = cas
        .register(registration(
            "reference-app",
            ClientKind::Confidential,
            CALLBACK,
        ))
        .await;
    let secret = registered
        .secret
        .expect("a confidential client has a secret");
    let metadata = discover(&http, cas.issuer()).await;
    let rp = RelyingParty::new(
        &metadata,
        "reference-app",
        Some(secret.expose()),
        AuthType::BasicAuth,
        CALLBACK,
    );
    let mut browser = signed_in_browser(&cas).await;

    // Every advertised response mode is honoured when asked for by name.
    let modes = document["response_modes_supported"]
        .as_array()
        .expect("a list");
    for mode in modes {
        let mode = mode.as_str().expect("a string value").to_owned();
        match mode.as_str() {
            "query" => {
                let request = rp.authorize_with(&[], |request| {
                    request.add_extra_param("response_mode", mode)
                });
                let location = browser.visit(&request.url).await.redirect().clone();
                let code = rp.callback(&location, &request.state);
                let tokens = rp.exchange(code, request.verifier).await;
                rp.claims(&tokens, Some(&request.nonce));
            }
            other => panic!("the document advertises response mode {other}: {EXTEND}"),
        }
    }

    // `request_uri_parameter_supported: false` is true of the server.
    assert_eq!(document["request_uri_parameter_supported"], false);
    let request = rp.authorize_with(&[], |request| {
        request.add_extra_param("request_uri", "https://rp.example/request.jwt")
    });
    let location = browser.visit(&request.url).await.redirect().clone();
    let parameters = rp.callback_parameters(&location, &request.state);
    assert!(
        parameters
            .iter()
            .any(|(name, value)| name == "error" && value == "request_uri_not_supported"),
        "{location}"
    );

    drop((browser, rp, http));
    cas.stop().await;
}
