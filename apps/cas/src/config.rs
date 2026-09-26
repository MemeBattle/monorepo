use std::cell::Cell;
use std::path::Path;

use axum::http::HeaderValue;
use thiserror::Error;
use webauthn_rs::prelude::Url;

// All .env files live in the monorepo root, resolved at compile time. That is
// safe because deployments supply real environment variables and missing files
// are skipped silently.
const MONOREPO_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
const DEFAULT_APP_ENV: &str = "development";

const DEFAULT_PORT: u16 = 3000;
const DEFAULT_RP_ID: &str = "localhost";
const DEFAULT_ORIGIN: &str = "http://localhost:5173";
const DEFAULT_CORS_ORIGINS: &str = "http://localhost:5173";
// Matches the dev credentials in apps/cas/docker-compose.yml.
const DEFAULT_DATABASE_URL: &str = "postgres://cas:cas@localhost:5434/cas";
// The backend's own address, not `CAS_ORIGIN` (the frontend's).
const DEFAULT_ISSUER: &str = "http://localhost:3000";

// The checked-in development signing key exists only in debug builds, so a
// release server cannot start on a key that is public by construction
// (docs/adr/0009-signing-key-and-discovery.md (c)).
#[cfg(debug_assertions)]
const DEFAULT_SIGNING_KEY: Option<&str> = Some(include_str!("../dev/signing-key.pem"));
#[cfg(not(debug_assertions))]
const DEFAULT_SIGNING_KEY: Option<&str> = None;

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

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub rp_id: String,
    pub origin: Url,
    pub cors_origins: Vec<HeaderValue>,
    pub database_url: String,
    /// The OIDC issuer, published exactly as typed.
    pub issuer: String,
    /// `None` only in a release build with no `CAS_SIGNING_KEY`: the tools
    /// that share this config never sign, and the server refuses to start
    /// without a key (`http::app`).
    pub signing_key: Option<SigningKeyPem>,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_values(
            env_value("CAS_PORT")?,
            env_value("CAS_RP_ID")?,
            env_value("CAS_ORIGIN")?,
            env_value("CAS_CORS_ORIGINS")?,
            env_value("DATABASE_URL")?,
            env_value("CAS_ISSUER")?,
            env_value("CAS_SIGNING_KEY")?,
        )
    }

    fn from_values(
        port: Option<String>,
        rp_id: Option<String>,
        origin: Option<String>,
        cors_origins: Option<String>,
        database_url: Option<String>,
        issuer: Option<String>,
        signing_key: Option<String>,
    ) -> Result<Self, ConfigError> {
        let port = match port {
            Some(value) => value.parse().map_err(|_| ConfigError::InvalidPort(value))?,
            None => DEFAULT_PORT,
        };

        let rp_id = rp_id.unwrap_or_else(|| DEFAULT_RP_ID.to_string());

        let origin = origin.unwrap_or_else(|| DEFAULT_ORIGIN.to_string());
        let origin = Url::parse(&origin).map_err(|_| ConfigError::InvalidOrigin(origin))?;

        let cors_origins = cors_origins.unwrap_or_else(|| DEFAULT_CORS_ORIGINS.to_string());
        let cors_origins = parse_cors_origins(&cors_origins)?;

        let database_url = database_url.unwrap_or_else(|| DEFAULT_DATABASE_URL.to_string());
        // Validate eagerly so a typo fails startup instead of the first query.
        database_url
            .parse::<sqlx::postgres::PgConnectOptions>()
            .map_err(|_| ConfigError::InvalidDatabaseUrl(database_url.clone()))?;

        let issuer = issuer.unwrap_or_else(|| DEFAULT_ISSUER.to_string());
        if !is_valid_issuer(&issuer) {
            return Err(ConfigError::InvalidIssuer(issuer));
        }

        let signing_key = resolve_signing_key(signing_key, DEFAULT_SIGNING_KEY)?;

        Ok(Self {
            port,
            rp_id,
            origin,
            cors_origins,
            database_url,
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

/// Loads the monorepo root .env files. `APP_ENV` selects the environment
/// (default: development).
///
/// Real environment variables always win: `dotenvy::from_filename` never
/// overrides an already-set variable, so visiting the candidates in
/// highest-priority-first order reproduces dotenv-flow precedence.
pub fn load_env_files() {
    let app_env = std::env::var("APP_ENV").unwrap_or_else(|_| DEFAULT_APP_ENV.to_string());
    let root = Path::new(MONOREPO_ROOT);

    for file_name in env_file_names(&app_env) {
        dotenvy::from_filename(root.join(file_name)).ok();
    }
}

fn env_file_names(app_env: &str) -> Vec<String> {
    vec![
        format!(".env.{app_env}.local"),
        format!(".env.{app_env}"),
        ".env.local".to_string(),
        ".env".to_string(),
    ]
}

fn env_value(name: &'static str) -> Result<Option<String>, ConfigError> {
    match std::env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(std::env::VarError::NotUnicode(_)) => Err(ConfigError::NotUnicode(name)),
    }
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

    #[test]
    fn lists_env_files_in_priority_order() {
        assert_eq!(
            env_file_names("development"),
            [
                ".env.development.local",
                ".env.development",
                ".env.local",
                ".env",
            ]
        );
    }

    #[test]
    fn loads_env_local_for_every_environment() {
        assert_eq!(
            env_file_names("test"),
            [".env.test.local", ".env.test", ".env.local", ".env"]
        );
    }

    #[test]
    fn defaults_when_no_values_are_set() {
        let config = Config::from_values(None, None, None, None, None, None, None).unwrap();

        assert_eq!(config.port, 3000);
        assert_eq!(config.rp_id, "localhost");
        assert_eq!(config.origin.as_str(), "http://localhost:5173/");
        assert_eq!(
            config.cors_origins,
            vec![HeaderValue::from_static("http://localhost:5173")]
        );
        assert_eq!(config.database_url, "postgres://cas:cas@localhost:5434/cas");
        assert_eq!(config.issuer, "http://localhost:3000");
        // The development key is the default in debug builds only; a release
        // build has none, and the server refuses to start without one.
        let signing_key = config.signing_key.as_ref().map(SigningKeyPem::expose);
        if cfg!(debug_assertions) {
            assert_eq!(signing_key, Some(include_str!("../dev/signing-key.pem")));
        } else {
            assert_eq!(signing_key, None);
        }
    }

    #[test]
    fn parses_provided_values() {
        let config = Config::from_values(
            Some("8080".to_string()),
            Some("cas.example.com".to_string()),
            Some("https://cas.example.com".to_string()),
            Some("https://a.example.com, https://b.example.com".to_string()),
            Some("postgres://user:pass@db.example.com:5432/cas".to_string()),
            Some("https://cas.example.com".to_string()),
            Some("provided key".to_string()),
        )
        .unwrap();

        assert_eq!(config.port, 8080);
        assert_eq!(config.rp_id, "cas.example.com");
        assert_eq!(config.origin.as_str(), "https://cas.example.com/");
        assert_eq!(
            config.cors_origins,
            vec![
                HeaderValue::from_static("https://a.example.com"),
                HeaderValue::from_static("https://b.example.com"),
            ]
        );
        assert_eq!(
            config.database_url,
            "postgres://user:pass@db.example.com:5432/cas"
        );
        assert_eq!(config.issuer, "https://cas.example.com");
        assert_eq!(config.signing_key.unwrap().expose(), "provided key");
    }

    #[test]
    fn rejects_invalid_port() {
        let error = Config::from_values(
            Some("not-a-port".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap_err();

        assert!(matches!(error, ConfigError::InvalidPort(value) if value == "not-a-port"));
    }

    #[test]
    fn rejects_invalid_origin() {
        let error = Config::from_values(
            None,
            None,
            Some("not-a-url".to_string()),
            None,
            None,
            None,
            None,
        )
        .unwrap_err();

        assert!(matches!(error, ConfigError::InvalidOrigin(value) if value == "not-a-url"));
    }

    #[test]
    fn rejects_invalid_cors_origin() {
        let error = Config::from_values(
            None,
            None,
            None,
            Some("https://ok.example.com,bad\u{7f}origin".to_string()),
            None,
            None,
            None,
        )
        .unwrap_err();

        assert!(
            matches!(error, ConfigError::InvalidCorsOrigin(value) if value == "bad\u{7f}origin")
        );
    }

    #[test]
    fn rejects_invalid_database_url() {
        let error = Config::from_values(
            None,
            None,
            None,
            None,
            Some("not-a-url".to_string()),
            None,
            None,
        )
        .unwrap_err();

        assert!(matches!(error, ConfigError::InvalidDatabaseUrl(value) if value == "not-a-url"));
    }

    fn with_issuer(issuer: &str) -> Result<Config, ConfigError> {
        Config::from_values(None, None, None, None, None, Some(issuer.to_string()), None)
    }

    #[test]
    fn keeps_an_issuer_exactly_as_typed() {
        for issuer in ["https://cas.example/path", "https://cas.example:8443"] {
            assert_eq!(with_issuer(issuer).unwrap().issuer, issuer);
        }
    }

    #[test]
    fn rejects_an_issuer_that_is_not_published_verbatim() {
        for issuer in [
            "not-a-url",
            "ftp://x",
            "https://cas.example/",
            "http://cas.example/?a=b",
            "http://cas.example/#frag",
            "https:cas.example",
            "https://cas.example/a b",
            "https://cas.example/\tx",
        ] {
            let error = with_issuer(issuer).unwrap_err();
            assert!(
                matches!(&error, ConfigError::InvalidIssuer(value) if value == issuer),
                "{issuer:?}: {error:?}"
            );
        }
    }

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

    #[test]
    fn debug_of_the_config_redacts_the_signing_key() {
        let config = Config::from_values(
            None,
            None,
            None,
            None,
            None,
            None,
            Some(include_str!("../dev/signing-key.pem").to_string()),
        )
        .unwrap();
        assert!(config.signing_key.is_some());

        let debug = format!("{config:?}");
        assert!(!debug.contains("PRIVATE KEY"), "{debug}");
        assert!(debug.contains("SigningKeyPem(<redacted>)"), "{debug}");
    }
}
