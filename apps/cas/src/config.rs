use axum::http::HeaderValue;
use thiserror::Error;
use webauthn_rs::prelude::Url;

const DEFAULT_PORT: u16 = 3000;
const DEFAULT_RP_ID: &str = "localhost";
const DEFAULT_ORIGIN: &str = "http://localhost:5173";
const DEFAULT_CORS_ORIGINS: &str = "http://localhost:5173";

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
}

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub rp_id: String,
    pub origin: Url,
    pub cors_origins: Vec<HeaderValue>,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_values(
            env_value("CAS_PORT")?,
            env_value("CAS_RP_ID")?,
            env_value("CAS_ORIGIN")?,
            env_value("CAS_CORS_ORIGINS")?,
        )
    }

    fn from_values(
        port: Option<String>,
        rp_id: Option<String>,
        origin: Option<String>,
        cors_origins: Option<String>,
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

        Ok(Self {
            port,
            rp_id,
            origin,
            cors_origins,
        })
    }
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
    fn defaults_when_no_values_are_set() {
        let config = Config::from_values(None, None, None, None).unwrap();

        assert_eq!(config.port, 3000);
        assert_eq!(config.rp_id, "localhost");
        assert_eq!(config.origin.as_str(), "http://localhost:5173/");
        assert_eq!(
            config.cors_origins,
            vec![HeaderValue::from_static("http://localhost:5173")]
        );
    }

    #[test]
    fn parses_provided_values() {
        let config = Config::from_values(
            Some("8080".to_string()),
            Some("cas.example.com".to_string()),
            Some("https://cas.example.com".to_string()),
            Some("https://a.example.com, https://b.example.com".to_string()),
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
    }

    #[test]
    fn rejects_invalid_port() {
        let error =
            Config::from_values(Some("not-a-port".to_string()), None, None, None).unwrap_err();

        assert!(matches!(error, ConfigError::InvalidPort(value) if value == "not-a-port"));
    }

    #[test]
    fn rejects_invalid_origin() {
        let error =
            Config::from_values(None, None, Some("not-a-url".to_string()), None).unwrap_err();

        assert!(matches!(error, ConfigError::InvalidOrigin(value) if value == "not-a-url"));
    }

    #[test]
    fn rejects_invalid_cors_origin() {
        let error = Config::from_values(
            None,
            None,
            None,
            Some("https://ok.example.com,bad\u{7f}origin".to_string()),
        )
        .unwrap_err();

        assert!(
            matches!(error, ConfigError::InvalidCorsOrigin(value) if value == "bad\u{7f}origin")
        );
    }
}
