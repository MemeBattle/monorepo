//! Where the running service's settings come from.
//!
//! Two deployments, two sources. A native process reads environment variables
//! and the monorepo's `.env` files ([`Config::from_env`]); a Cloudflare Worker
//! has neither, so it reads its bindings ([`WorkerConfig`], ADR 0022 (e)). The
//! validators below are shared, so a value means the same thing in both.

use std::cell::Cell;

use axum::http::HeaderValue;
use thiserror::Error;
use webauthn_rs::prelude::Url;

#[cfg(not(target_arch = "wasm32"))]
mod native;
#[cfg(target_arch = "wasm32")]
mod worker;

#[cfg(not(target_arch = "wasm32"))]
pub use native::{Config, load_env_files};

#[derive(Debug, Error, miette::Diagnostic)]
pub enum ConfigError {
    #[error("{0} is not valid unicode")]
    #[diagnostic(code(cas::config_error))]
    NotUnicode(&'static str),

    #[error("CAS_PORT: {0:?} is not a valid port number")]
    #[diagnostic(code(cas::config_error))]
    InvalidPort(String),

    #[error("CAS_ORIGIN: {0:?} is not a valid origin URL")]
    #[diagnostic(code(cas::config_error))]
    InvalidOrigin(String),

    #[error("CAS_CORS_ORIGINS: {0:?} is not a valid origin")]
    #[diagnostic(code(cas::config_error))]
    InvalidCorsOrigin(String),

    #[error("DATABASE_URL: {0:?} is not a valid Postgres connection URL")]
    #[diagnostic(code(cas::config_error))]
    InvalidDatabaseUrl(String),

    #[error(
        "CAS_ISSUER: {0:?} is not a valid issuer (an http or https URL with a host, \
         no query, no fragment, no trailing slash, written exactly as it is published)"
    )]
    #[diagnostic(code(cas::config_error))]
    InvalidIssuer(String),

    #[error("CAS_SIGNING_KEY is set but empty")]
    #[diagnostic(code(cas::config_error))]
    EmptySigningKey,

    /// A Worker binding that is not there. Unlike the native process, which
    /// has development defaults to fall back on, a Worker is a deployment:
    /// every binding is required (ADR 0022 (e)).
    #[error("{0} is not bound")]
    #[diagnostic(code(cas::config_error))]
    MissingBinding(&'static str),
}

/// The PEM text of `CAS_SIGNING_KEY`, unparsed: config knows no context, so
/// reading the key is `oidc::keys`' job when the server is built. The value
/// is a secret, so `Debug` never prints it.
#[derive(Clone)]
pub struct SigningKeyPem(String);

impl SigningKeyPem {
    pub fn new(pem: impl Into<String>) -> Self {
        Self(pem.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SigningKeyPem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SigningKeyPem(<redacted>)")
    }
}

/// What a Cloudflare Worker runs on, from its bindings (ADR 0022 (e)).
///
/// The same values as [`Config`] minus two that have no meaning there:
/// `database_url`, because the database is the `HYPERDRIVE` binding and its
/// credentials are Hyperdrive's to hold, and `port`, because nothing listens
/// on one — the runtime hands the entrypoint a request.
///
/// Every field is required. A Worker is a deployment, so there is no
/// localhost default to fall back on and no debug default signing key: a
/// missing binding is a misconfigured deployment, which the entrypoint
/// answers with `http::not_started` — a 503 naming the condition, never a 500
/// (ADR 0022 (g)).
///
/// Compiled on every target, so this parsing is unit-tested by `cargo test`;
/// only the binding reading itself is wasm32-only.
#[derive(Debug, Clone)]
pub struct WorkerConfig {
    pub rp_id: String,
    pub origin: Url,
    pub cors_origins: Vec<HeaderValue>,
    /// The OIDC issuer, published exactly as typed.
    pub issuer: String,
    pub signing_key: SigningKeyPem,
}

impl WorkerConfig {
    /// The five binding values, validated exactly as [`Config::from_env`]
    /// validates the matching variables.
    pub fn from_values(
        rp_id: Option<String>,
        origin: Option<String>,
        cors_origins: Option<String>,
        issuer: Option<String>,
        signing_key: Option<String>,
    ) -> Result<Self, ConfigError> {
        let rp_id = rp_id.ok_or(ConfigError::MissingBinding("CAS_RP_ID"))?;

        let origin = origin.ok_or(ConfigError::MissingBinding("CAS_ORIGIN"))?;
        let origin = Url::parse(&origin).map_err(|_| ConfigError::InvalidOrigin(origin))?;

        let cors_origins = cors_origins.ok_or(ConfigError::MissingBinding("CAS_CORS_ORIGINS"))?;
        let cors_origins = parse_cors_origins(&cors_origins)?;

        let issuer = issuer.ok_or(ConfigError::MissingBinding("CAS_ISSUER"))?;
        if !is_valid_issuer(&issuer) {
            return Err(ConfigError::InvalidIssuer(issuer));
        }

        let signing_key = resolve_signing_key(signing_key, None)?
            .ok_or(ConfigError::MissingBinding("CAS_SIGNING_KEY"))?;

        Ok(Self {
            rp_id,
            origin,
            cors_origins,
            issuer,
            signing_key,
        })
    }
}

/// The provided value wins over the default; an empty one is a mistake
/// rather than "no key". `None` at the end is not a config error: only the
/// server needs a key, and it says so itself.
fn resolve_signing_key(
    value: Option<String>,
    default: Option<&str>,
) -> Result<Option<SigningKeyPem>, ConfigError> {
    match value {
        Some(value) if value.trim().is_empty() => Err(ConfigError::EmptySigningKey),
        Some(value) => Ok(Some(SigningKeyPem(value))),
        None => Ok(default.map(SigningKeyPem::new)),
    }
}

/// Whether `value` can be published as the OIDC `issuer` exactly as typed.
///
/// Discovery §4.3 requires the published `issuer` to be identical to the
/// value a client was configured with, so nothing is trimmed or repaired: a
/// value that needs repair is refused. The checks are the ones
/// `clients/redirect_uri.rs` makes, for the same reason (the WHATWG parser
/// silently repairs input), duplicated because config must not import a
/// context: RFC 3986 characters only, a parse that reports no syntax
/// violation, `http`/`https`, a host, no query and no fragment (Discovery
/// §3). A trailing `/` is refused too: endpoints are `{issuer}/<path>`, and
/// the operator drops the slash, CAS does not.
fn is_valid_issuer(value: &str) -> bool {
    let is_uri_byte = |b: u8| {
        b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'-' | b'.'
                    | b'_'
                    | b'~'
                    | b':'
                    | b'/'
                    | b'?'
                    | b'#'
                    | b'['
                    | b']'
                    | b'@'
                    | b'!'
                    | b'$'
                    | b'&'
                    | b'\''
                    | b'('
                    | b')'
                    | b'*'
                    | b'+'
                    | b','
                    | b';'
                    | b'='
                    | b'%'
            )
    };
    if !value.bytes().all(is_uri_byte) {
        return false;
    }

    let violated = Cell::new(false);
    let Ok(url) = Url::options()
        .syntax_violation_callback(Some(&|_| violated.set(true)))
        .parse(value)
    else {
        return false;
    };

    !violated.get()
        && matches!(url.scheme(), "http" | "https")
        && url.host().is_some()
        && url.query().is_none()
        && url.fragment().is_none()
        && !value.ends_with('/')
}

fn parse_cors_origins(value: &str) -> Result<Vec<HeaderValue>, ConfigError> {
    value
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(|origin| {
            HeaderValue::from_str(origin)
                .map_err(|_| ConfigError::InvalidCorsOrigin(origin.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The release-build path: no value and no default is not a config
    /// error, so `cas-migrate` and `cas-client` still load their config.
    #[test]
    fn no_signing_key_and_no_default_is_none() {
        assert!(resolve_signing_key(None, None).unwrap().is_none());
    }

    #[test]
    fn rejects_an_empty_signing_key() {
        for value in ["", " \n\t "] {
            assert!(matches!(
                resolve_signing_key(Some(value.to_string()), Some("default")),
                Err(ConfigError::EmptySigningKey)
            ));
        }
    }

    #[test]
    fn a_provided_signing_key_wins_over_the_default() {
        let key = resolve_signing_key(Some("provided".to_string()), Some("default"))
            .unwrap()
            .unwrap();
        assert_eq!(key.expose(), "provided");

        let key = resolve_signing_key(None, Some("default")).unwrap().unwrap();
        assert_eq!(key.expose(), "default");
    }

    /// The five bindings a Worker is deployed with.
    fn worker_values() -> [Option<String>; 5] {
        [
            Some("cas.example.com".to_string()),
            Some("https://cas.example.com".to_string()),
            Some("https://a.example.com, https://b.example.com".to_string()),
            Some("https://cas.example.com".to_string()),
            Some("provided key".to_string()),
        ]
    }

    fn worker_config(values: [Option<String>; 5]) -> Result<WorkerConfig, ConfigError> {
        let [rp_id, origin, cors_origins, issuer, signing_key] = values;
        WorkerConfig::from_values(rp_id, origin, cors_origins, issuer, signing_key)
    }

    /// Every value is parsed exactly as the native path parses the matching
    /// variable: the shared validators are the same code.
    #[test]
    fn parses_the_worker_bindings() {
        let config = worker_config(worker_values()).unwrap();

        assert_eq!(config.rp_id, "cas.example.com");
        assert_eq!(config.origin.as_str(), "https://cas.example.com/");
        assert_eq!(
            config.cors_origins,
            vec![
                HeaderValue::from_static("https://a.example.com"),
                HeaderValue::from_static("https://b.example.com"),
            ]
        );
        assert_eq!(config.issuer, "https://cas.example.com");
        assert_eq!(config.signing_key.expose(), "provided key");
    }

    /// A Worker has no development defaults, the signing key included: each
    /// missing binding is named, so an operator reads which one to set.
    #[test]
    fn every_worker_binding_is_required() {
        for (index, name) in [
            "CAS_RP_ID",
            "CAS_ORIGIN",
            "CAS_CORS_ORIGINS",
            "CAS_ISSUER",
            "CAS_SIGNING_KEY",
        ]
        .into_iter()
        .enumerate()
        {
            let mut values = worker_values();
            values[index] = None;

            let error = worker_config(values).unwrap_err();
            assert!(
                matches!(error, ConfigError::MissingBinding(missing) if missing == name),
                "{name}: {error:?}"
            );
        }
    }

    /// One case each: the validators are shared with `Config::from_values`,
    /// which covers the rest.
    #[test]
    fn rejects_worker_bindings_the_native_server_would_refuse_too() {
        let invalid = |index: usize, value: &str| {
            let mut values = worker_values();
            values[index] = Some(value.to_string());
            worker_config(values).unwrap_err()
        };

        assert!(
            matches!(invalid(1, "not-a-url"), ConfigError::InvalidOrigin(value) if value == "not-a-url")
        );
        assert!(
            matches!(invalid(2, "bad\u{7f}origin"), ConfigError::InvalidCorsOrigin(value) if value == "bad\u{7f}origin")
        );
        assert!(
            matches!(invalid(3, "https://cas.example/"), ConfigError::InvalidIssuer(value) if value == "https://cas.example/")
        );
        assert!(matches!(invalid(4, " \n"), ConfigError::EmptySigningKey));
    }

    #[test]
    fn debug_of_the_worker_config_redacts_the_signing_key() {
        let mut values = worker_values();
        values[4] = Some(include_str!("../../dev/signing-key.pem").to_string());

        let debug = format!("{:?}", worker_config(values).unwrap());

        assert!(!debug.contains("PRIVATE KEY"), "{debug}");
        assert!(debug.contains("SigningKeyPem(<redacted>)"), "{debug}");
    }
}
