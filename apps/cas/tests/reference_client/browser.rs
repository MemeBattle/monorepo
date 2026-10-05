//! The user's browser, for the steps a relying party never performs:
//! following redirects to CAS, holding CAS's session cookie, and the
//! frontend's passkey ceremonies over CAS's own `/api`. The paths under
//! `/api` are the only ones hard-coded in the suite: here the test plays the
//! cas-frontend, which knows them, not the relying party.

use axum_extra::extract::cookie::Cookie;
use openidconnect::reqwest::{self, Method, StatusCode, header, redirect::Policy};
use openidconnect::url::Url;
use serde_json::{Value, json};
use webauthn_authenticator_rs::WebauthnAuthenticator;
use webauthn_rs::prelude::CreationChallengeResponse;

use crate::cas::{Cas, FRONTEND_ORIGIN};
use crate::soft_passkey::ResidentSoftPasskey;

/// What a navigation answered: the status and, for a redirect, where to.
pub struct Visited {
    pub status: StatusCode,
    pub location: Option<Url>,
}

impl Visited {
    /// The target of a `302`, which every navigation of the flow is.
    pub fn redirect(&self) -> &Url {
        assert_eq!(self.status, StatusCode::FOUND, "a redirect");
        self.location.as_ref().expect("a redirect has a Location")
    }
}

pub struct Browser {
    http: reqwest::Client,
    issuer: Url,
    /// The one cookie CAS sets, as `name=value`. Its name is whatever CAS
    /// sent: the browser does not know it in advance.
    cookie: Option<String>,
    authenticator: WebauthnAuthenticator<ResidentSoftPasskey>,
}

impl Browser {
    pub fn new(cas: &Cas) -> Self {
        Self {
            // A browser follows redirects, but this one reports them instead,
            // so the test sees each hop and nobody needs to listen on the
            // relying party's callback.
            http: reqwest::Client::builder()
                .redirect(Policy::none())
                .no_proxy()
                .build()
                .expect("an HTTP client builds"),
            issuer: Url::parse(cas.issuer()).expect("the issuer is a URL"),
            cookie: None,
            authenticator: WebauthnAuthenticator::new(ResidentSoftPasskey::new()),
        }
    }

    /// Whether the browser holds a cookie from CAS.
    pub fn holds_cookie(&self) -> bool {
        self.cookie.is_some()
    }

    /// A top-level navigation to `url`.
    pub async fn visit(&mut self, url: &Url) -> Visited {
        let response = self.send(Method::GET, url.clone(), None).await;
        let location = response.headers().get(header::LOCATION).map(|value| {
            let value = value.to_str().expect("an ASCII Location");
            url.join(value).expect("a valid Location")
        });
        Visited {
            status: response.status(),
            location,
        }
    }

    /// The frontend's registration ceremony: the options, the passkey's
    /// answer, the verification. Without a session this creates an account;
    /// under an upgrade session it upgrades the guest (ADR 0015 (e)). Either
    /// way the answer carries the new session's cookie.
    pub async fn create_account(&mut self, display_name: &str) {
        let options = self
            .api(
                Method::POST,
                "webauthn/register-options",
                json!({ "displayName": display_name }),
            )
            .await;
        let ccr: CreationChallengeResponse =
            serde_json::from_value(options["ccr"].clone()).expect("a creation challenge");
        let credential = self
            .authenticator
            .do_registration(Url::parse(FRONTEND_ORIGIN).expect("a valid origin"), ccr)
            .expect("the software authenticator answers the challenge");
        self.api(
            Method::POST,
            "webauthn/verify-registration",
            json!({
                "registrationId": options["registrationId"],
                "response": credential,
            }),
        )
        .await;
    }

    /// The dashboard setting the account's address.
    pub async fn set_email(&mut self, address: &str) {
        self.api(Method::PATCH, "me", json!({ "email": address }))
            .await;
    }

    /// Whether CAS sees a signed-in account behind the cookie, as the
    /// frontend asks it.
    pub async fn is_signed_in(&mut self) -> bool {
        let url = self.issuer.join("/api/me").expect("a valid path");
        let response = self.send(Method::GET, url, None).await;
        match response.status() {
            StatusCode::OK => true,
            StatusCode::UNAUTHORIZED => false,
            status => panic!("GET /api/me answered {status}"),
        }
    }

    /// What the frontend does after its ceremony: CAS sent the browser to
    /// `screen` (`/sign-in` or `/create-account`) with `return_to`, and the
    /// frontend navigates back to it on CAS.
    pub async fn follow_return_to(&mut self, location: &Url, screen: &str) -> Visited {
        let return_to = return_to(location, screen);
        let url = self.issuer.join(&return_to).expect("a valid return_to");
        self.visit(&url).await
    }

    /// A call of the frontend to CAS's `/api`: JSON, from the frontend's
    /// origin, which the CSRF line admits.
    async fn api(&mut self, method: Method, path: &str, body: Value) -> Value {
        let url = self
            .issuer
            .join(&format!("/api/{path}"))
            .expect("a valid path");
        let response = self.send(method.clone(), url, Some(body)).await;
        let status = response.status();
        let bytes = response.bytes().await.expect("a readable body");
        assert!(
            status.is_success(),
            "{method} /api/{path} answered {status}: {}",
            String::from_utf8_lossy(&bytes)
        );
        if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).expect("a JSON body")
        }
    }

    /// One request with the cookie, if the browser holds one; a cookie the
    /// answer sets replaces it, and a removal clears it.
    async fn send(&mut self, method: Method, url: Url, body: Option<Value>) -> reqwest::Response {
        let mut request = self.http.request(method, url);
        if let Some(cookie) = &self.cookie {
            request = request.header(header::COOKIE, cookie);
        }
        if let Some(body) = body {
            request = request
                .header(header::ORIGIN, FRONTEND_ORIGIN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(body.to_string());
        }
        let response = request.send().await.expect("CAS answers");
        for value in response.headers().get_all(header::SET_COOKIE) {
            let cookie = Cookie::parse(value.to_str().expect("an ASCII Set-Cookie"))
                .expect("a valid Set-Cookie");
            let removed = cookie.value().is_empty()
                || cookie
                    .max_age()
                    .is_some_and(|max_age| max_age <= time::Duration::ZERO);
            self.cookie = (!removed).then(|| format!("{}={}", cookie.name(), cookie.value()));
        }
        response
    }
}

/// The `return_to` of a redirect to the frontend's `screen`, after checking
/// that it is one.
pub fn return_to(location: &Url, screen: &str) -> String {
    assert_eq!(
        location.origin().ascii_serialization(),
        FRONTEND_ORIGIN,
        "{location} is on the frontend"
    );
    assert_eq!(location.path(), screen, "{location}");
    location
        .query_pairs()
        .find(|(name, _)| name == "return_to")
        .map(|(_, value)| value.into_owned())
        .unwrap_or_else(|| panic!("{location} carries return_to"))
}
