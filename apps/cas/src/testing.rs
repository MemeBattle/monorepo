//! Test support shared by all of the crate's tests.
//!
//! Compiled only for `cfg(test)`, so a normal build never includes the
//! software authenticator. See `docs/TESTS.md`.

use std::fmt::Write as _;
use std::sync::{Arc, Mutex, Once};

use sqlx::PgPool;
use tracing::field::{Field, Visit};
use tracing::span::{Attributes, Id, Record};
use tracing::subscriber::DefaultGuard;
use tracing_subscriber::Registry;
use tracing_subscriber::layer::{Context, Layer, SubscriberExt};
use uuid::Uuid;
use webauthn_authenticator_rs::{
    AuthenticatorBackend, WebauthnAuthenticator, error::WebauthnCError, softpasskey::SoftPasskey,
};
use webauthn_rs::prelude::{
    Base64UrlSafeData, CreationChallengeResponse, Passkey, PublicKeyCredential,
    RegisterPublicKeyCredential, RequestChallengeResponse, Url, Webauthn,
};
use webauthn_rs_proto::{
    AllowCredentials, CredProps, PublicKeyCredentialCreationOptions,
    PublicKeyCredentialRequestOptions, ResidentKeyRequirement,
};

use crate::accounts::DisplayName;
use crate::http::ApiState;
use crate::sessions::http::CookieSettings;
use crate::sessions::{SessionService, SessionToken};
use crate::webauthn::build_webauthn;
use crate::webauthn::login::LoginService;
use crate::webauthn::management::PasskeyManagement;
use crate::webauthn::registration::{
    Registered, RegistrationService, start_discoverable_registration,
};

/// The API state the handler tests run against: every service on the given
/// pool, cookies as the development origin would have them.
pub fn test_state(pool: PgPool) -> ApiState {
    test_state_with_cookies(pool, test_cookies())
}

/// The same state with the cookie settings of another deployment, for a test
/// that has to see what an https origin puts on the wire.
pub fn test_state_with_cookies(pool: PgPool, cookies: CookieSettings) -> ApiState {
    ApiState {
        registration: RegistrationService::new(test_webauthn(), pool.clone()),
        login: LoginService::new(test_webauthn(), pool.clone()),
        passkeys: PasskeyManagement::new(pool.clone()),
        sessions: SessionService::new(pool),
        cookies,
    }
}

/// The cookie settings `test_state` runs with. The test origin is plain
/// http, so these are the development ones: no `Secure`, and therefore the
/// unprefixed cookie name.
pub fn test_cookies() -> CookieSettings {
    CookieSettings::for_origin(&test_origin())
}

/// The session cookie a `Set-Cookie` header carries, parsed back into the
/// token, so a test can check what the browser was given and use it. The
/// name comes from the settings the response was produced with: a cookie
/// under any other name is not this deployment's session.
pub fn session_cookie(response: &axum::response::Response, name: &str) -> Option<SessionToken> {
    let header = response.headers().get(axum::http::header::SET_COOKIE)?;
    let cookie = axum_extra::extract::cookie::Cookie::parse(header.to_str().ok()?).ok()?;
    (cookie.name() == name)
        .then(|| SessionToken::parse(cookie.value()))
        .flatten()
}

/// Everything `tracing` emitted while the capture was installed, one string
/// per event and one per span: its level, its target, and every field
/// rendered with `Debug`, the message among them. Spans are captured because
/// the production formatter prints an event together with the fields of the
/// spans it sits in: a request span that carried a header would put that
/// header on every line logged inside the request, and a capture that saw
/// events alone would call such a log clean. A test that must prove a secret
/// never reaches a log searches this text for it, which is the only check
/// that holds however the output is formatted downstream.
#[derive(Clone, Default)]
pub struct CapturedEvents(Arc<Mutex<Vec<String>>>);

impl CapturedEvents {
    fn record(&self, event: String) {
        self.0
            .lock()
            .expect("the capture mutex is only held to push one line")
            .push(event);
    }

    pub fn all(&self) -> Vec<String> {
        self.0
            .lock()
            .expect("the capture mutex is only held to push one line")
            .clone()
    }

    /// The captured events whose text contains `needle` — a message, a field
    /// name, a rendered value.
    pub fn mentioning(&self, needle: &str) -> Vec<String> {
        self.all()
            .into_iter()
            .filter(|event| event.contains(needle))
            .collect()
    }

    pub fn contains(&self, needle: &str) -> bool {
        !self.mentioning(needle).is_empty()
    }
}

/// Installs [`CapturedEvents`] as this thread's subscriber for as long as the
/// returned guard lives, and returns both:
///
/// ```ignore
/// let (events, _guard) = capture_tracing();
/// ```
///
/// The guard must be bound, or the capture is dropped before the code under
/// test runs. `sqlx::test` drives a current-thread runtime, so the guard
/// covers the async code too; other threads keep whatever subscriber they
/// had, which is what lets the tests run in parallel.
pub fn capture_tracing() -> (CapturedEvents, DefaultGuard) {
    // `tracing` decides once per process whether a given line is worth
    // evaluating at all, and decides it from the *global* subscriber. With
    // none installed, a line first reached by another test's thread is
    // written off as disabled for everyone, and this thread's capture would
    // then silently miss it. A global subscriber that keeps nothing makes
    // every line live; the thread-local one below is what records.
    static GLOBAL: Once = Once::new();
    GLOBAL.call_once(|| {
        let _ = tracing::subscriber::set_global_default(Registry::default());
    });

    let events = CapturedEvents::default();
    let guard =
        tracing::subscriber::set_default(Registry::default().with(CaptureLayer(events.clone())));
    (events, guard)
}

struct CaptureLayer(CapturedEvents);

impl<S: tracing::Subscriber> Layer<S> for CaptureLayer {
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let metadata = event.metadata();
        let mut rendered = format!("{} {}", metadata.level(), metadata.target());
        event.record(&mut RenderFields(&mut rendered));
        self.0.record(rendered);
    }

    /// A span's fields at creation, rendered like an event's. The request
    /// span of the trace layer is one: its `uri` and, if ever enabled, its
    /// `headers` are what a formatter would print next to every event of the
    /// request.
    fn on_new_span(&self, attrs: &Attributes<'_>, _id: &Id, _ctx: Context<'_, S>) {
        let metadata = attrs.metadata();
        let mut rendered = format!(
            "SPAN {} {} {}",
            metadata.level(),
            metadata.target(),
            metadata.name()
        );
        attrs.record(&mut RenderFields(&mut rendered));
        self.0.record(rendered);
    }

    /// Fields recorded on a span after creation (`span.record(...)`), which
    /// a formatter prints exactly like the ones it was created with.
    fn on_record(&self, _id: &Id, values: &Record<'_>, _ctx: Context<'_, S>) {
        let mut rendered = "SPAN record".to_owned();
        values.record(&mut RenderFields(&mut rendered));
        self.0.record(rendered);
    }
}

/// Renders every field, whatever its type, with `Debug`: the capture must not
/// be able to miss a secret by not knowing how to print it.
struct RenderFields<'a>(&'a mut String);

impl Visit for RenderFields<'_> {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        let _ = write!(self.0, " {}={value:?}", field.name());
    }
}

struct ResidentCredential {
    rp_id: String,
    descriptor: AllowCredentials,
    user_handle: Base64UrlSafeData,
}

/// Adds resident storage and RP-scoped discovery to SoftPasskey's real key
/// generation and signing. Only this test adapter downgrades the options passed
/// to SoftPasskey, which otherwise rejects every resident-key request.
pub struct ResidentSoftPasskey {
    signer: SoftPasskey,
    credentials: Vec<ResidentCredential>,
}

impl ResidentSoftPasskey {
    pub fn new() -> Self {
        Self {
            signer: SoftPasskey::new(true),
            credentials: Vec::new(),
        }
    }
}

impl AuthenticatorBackend for ResidentSoftPasskey {
    fn perform_register(
        &mut self,
        origin: Url,
        mut options: PublicKeyCredentialCreationOptions,
        timeout_ms: u32,
    ) -> Result<RegisterPublicKeyCredential, WebauthnCError> {
        let selection = options
            .authenticator_selection
            .as_mut()
            .ok_or(WebauthnCError::NotSupported)?;
        if selection.resident_key != Some(ResidentKeyRequirement::Required)
            || !selection.require_resident_key
        {
            return Err(WebauthnCError::NotSupported);
        }
        let rp_id = options.rp.id.clone();
        let user_handle = options.user.id.clone();
        selection.resident_key = Some(ResidentKeyRequirement::Discouraged);
        selection.require_resident_key = false;
        let mut response = self.signer.perform_register(origin, options, timeout_ms)?;
        self.credentials.push(ResidentCredential {
            rp_id,
            descriptor: AllowCredentials {
                type_: "public-key".to_owned(),
                id: response.raw_id.clone(),
                transports: None,
            },
            user_handle,
        });
        response.extensions.cred_props = Some(CredProps { rk: Some(true) });
        Ok(response)
    }

    fn perform_auth(
        &mut self,
        origin: Url,
        mut options: PublicKeyCredentialRequestOptions,
        timeout_ms: u32,
    ) -> Result<PublicKeyCredential, WebauthnCError> {
        let credential = self
            .credentials
            .iter()
            .find(|credential| {
                credential.rp_id == options.rp_id
                    && (options.allow_credentials.is_empty()
                        || options
                            .allow_credentials
                            .iter()
                            .any(|allowed| allowed.id == credential.descriptor.id))
            })
            .ok_or(WebauthnCError::NotSupported)?;
        options.allow_credentials = vec![credential.descriptor.clone()];
        let mut response = self.signer.perform_auth(origin, options, timeout_ms)?;
        response.response.user_handle = Some(credential.user_handle.clone());
        Ok(response)
    }
}

pub const TEST_RP_ID: &str = "localhost";
pub const TEST_ORIGIN: &str = "http://localhost:5173";

pub fn test_origin() -> Url {
    TEST_ORIGIN.parse().expect("the test origin is a valid URL")
}

/// The relying party the tests register against, built the way the server
/// builds its own.
pub fn test_webauthn() -> Webauthn {
    build_webauthn(TEST_RP_ID, &test_origin()).expect("the test relying party is valid")
}

pub fn display_name(value: &str) -> DisplayName {
    DisplayName::try_new(value).expect("a valid test display name")
}

/// Answers a registration challenge with a software authenticator, the way a
/// browser with a platform passkey would.
///
/// `falsify_uv = true`: registration requires user verification, which a
/// software authenticator can only claim to have done.
pub fn soft_passkey_registration(ccr: CreationChallengeResponse) -> RegisterPublicKeyCredential {
    WebauthnAuthenticator::new(ResidentSoftPasskey::new())
        .do_registration(test_origin(), ccr)
        .expect("the software authenticator answers a valid challenge")
}

/// Registers an account through the registration service and hands back the
/// software authenticator that now holds its passkey, so a test can sign in
/// with it: login needs the same emulator that answered the registration.
pub async fn register_soft_passkey(
    pool: &PgPool,
) -> (WebauthnAuthenticator<ResidentSoftPasskey>, Registered) {
    let service = RegistrationService::new(test_webauthn(), pool.clone());
    let mut authenticator = WebauthnAuthenticator::new(ResidentSoftPasskey::new());
    let started = service
        .start(display_name("Ada"))
        .await
        .expect("a registration can be started");
    let response = authenticator
        .do_registration(test_origin(), started.ccr)
        .expect("the software authenticator answers a valid challenge");
    let registered = service
        .finish(started.registration_id, &response)
        .await
        .expect("the software authenticator's answer verifies");
    (authenticator, registered)
}

/// Answers a login challenge with the credential the authenticator discovers
/// for the relying party, the way a browser with a platform passkey would.
pub fn soft_passkey_assertion(
    authenticator: &mut WebauthnAuthenticator<ResidentSoftPasskey>,
    rcr: RequestChallengeResponse,
) -> PublicKeyCredential {
    authenticator
        .do_authentication(test_origin(), rcr)
        .expect("the software authenticator answers a valid challenge")
}

/// Runs a full registration ceremony to obtain a real `Passkey`: a hand-built
/// one would not prove that the library's own serde shape survives storage.
pub fn test_passkey() -> Passkey {
    let webauthn = test_webauthn();
    let (ccr, state) = start_discoverable_registration(&webauthn, Uuid::new_v4(), "test")
        .expect("a registration can be started");
    let response = soft_passkey_registration(ccr);
    webauthn
        .finish_passkey_registration(&response, &state.passkey)
        .expect("the software authenticator's answer verifies")
}

#[cfg(test)]
mod capture_tests {
    use super::*;

    /// The capture sees what a formatter would print: the event's own fields
    /// and the fields of the span it sits in, whether given at creation or
    /// recorded later. Without that, a secret carried by a request span
    /// would pass a search of the events alone.
    #[test]
    fn a_span_field_is_captured_with_the_events_inside_it() {
        let (events, _guard) = capture_tracing();

        let span = tracing::info_span!(
            "request",
            carried = "span-secret",
            later = tracing::field::Empty
        );
        let _entered = span.enter();
        span.record("later", "recorded-secret");
        tracing::info!(own = "event-field", "inside");

        assert!(events.contains("span-secret"), "{:?}", events.all());
        assert!(events.contains("recorded-secret"), "{:?}", events.all());
        assert!(events.contains("event-field"), "{:?}", events.all());
        let [inside] = &events.mentioning("inside")[..] else {
            panic!("one event: {:?}", events.all());
        };
        assert!(inside.starts_with("INFO"), "{inside}");
    }
}
