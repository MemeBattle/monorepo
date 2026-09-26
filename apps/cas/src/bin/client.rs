//! `cas-client` — registers an OIDC client and exits.
//!
//! The registry is managed by hand until the admin panel exists, and a
//! migration is the wrong place for it: a migration runs everywhere, so a dev
//! client with a known secret would reach production. This binary is the
//! documented path instead (`README.md`, `scripts/seed-dev.sh`). It has one
//! subcommand; updating, listing, deleting and rotating wait for the admin
//! panel. See `docs/adr/0008-oidc-clients-registry.md`.
//!
//! A confidential client's secret is drawn here, printed once on stdout and
//! never stored: the table keeps only its SHA-256. Everything else — the log
//! line, the usage, every error — goes to stderr, so a script can capture the
//! secret by reading stdout alone.

use sqlx::postgres::PgPoolOptions;
use thiserror::Error;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use cas::clients::registration::register;
use cas::clients::{
    ClientId, ClientIdError, ClientKindError, ClientName, ClientNameError, RedirectUri,
    RedirectUriError, RegisterError, Registration, Scope, ScopeError,
};
use cas::config::{Config, ConfigError, load_env_files};

const USAGE: &str = "\
cas-client register --id <client_id> --name <name> --kind <public|confidential>
                    --redirect-uri <uri> [--redirect-uri <uri>]...
                    [--post-logout-redirect-uri <uri>]...
                    [--first-party] [--guest-login-allowed]
                    [--scope <scope>]...

Registers an OIDC client. --scope defaults to 'openid'. A confidential
client's secret is printed once and cannot be shown again.";

/// Exit code for a command line that could not be understood, so a script can
/// tell it apart from a registration that was refused.
const USAGE_EXIT_CODE: i32 = 2;

/// What the command line asked for. One variant today; the admin panel (M6)
/// owns the rest of the lifecycle.
#[derive(Debug)]
enum Command {
    Register(Box<Registration>),
}

/// Why a command line could not be turned into a [`Command`]. Every variant
/// names the flag it is about.
#[derive(Debug, Error, PartialEq, Eq)]
enum UsageError {
    #[error("a subcommand is required")]
    MissingSubcommand,

    #[error("unknown subcommand {0:?}")]
    UnknownSubcommand(String),

    #[error("{0} needs a value")]
    MissingValue(&'static str),

    #[error("unknown flag {0:?}")]
    UnknownFlag(String),

    #[error("{0} is required")]
    MissingFlag(&'static str),

    #[error("--id: {0}")]
    InvalidId(ClientIdError),

    #[error("--name: {0}")]
    InvalidName(ClientNameError),

    #[error("--kind: {0}")]
    InvalidKind(ClientKindError),

    #[error("{flag} {value:?}: {source}")]
    InvalidRedirectUri {
        flag: &'static str,
        value: String,
        source: RedirectUriError,
    },

    #[error("--scope {value:?}: {source}")]
    InvalidScope { value: String, source: ScopeError },
}

/// Parses the command line by hand: one subcommand and nine flags is less
/// code than a dependency, and keeps this binary the size of `migrate.rs`.
fn parse(args: impl Iterator<Item = String>) -> Result<Command, UsageError> {
    let mut args = args;
    match args.next().as_deref() {
        None => return Err(UsageError::MissingSubcommand),
        Some("register") => {}
        Some(other) => return Err(UsageError::UnknownSubcommand(other.to_owned())),
    }

    let mut id = None;
    let mut name = None;
    let mut kind = None;
    let mut redirect_uris = Vec::new();
    let mut post_logout_redirect_uris = Vec::new();
    let mut first_party = false;
    let mut guest_login_allowed = false;
    let mut scopes = Vec::new();

    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--id" => {
                let value = value(&mut args, "--id")?;
                id = Some(ClientId::try_new(value).map_err(UsageError::InvalidId)?);
            }
            "--name" => {
                let value = value(&mut args, "--name")?;
                name = Some(ClientName::try_new(value).map_err(UsageError::InvalidName)?);
            }
            "--kind" => {
                let value = value(&mut args, "--kind")?;
                kind = Some(value.parse().map_err(UsageError::InvalidKind)?);
            }
            "--redirect-uri" => {
                redirect_uris.push(redirect_uri(&mut args, "--redirect-uri")?);
            }
            "--post-logout-redirect-uri" => {
                post_logout_redirect_uris
                    .push(redirect_uri(&mut args, "--post-logout-redirect-uri")?);
            }
            "--first-party" => first_party = true,
            "--guest-login-allowed" => guest_login_allowed = true,
            "--scope" => {
                let value = value(&mut args, "--scope")?;
                let scope = Scope::try_new(value.clone())
                    .map_err(|source| UsageError::InvalidScope { value, source })?;
                scopes.push(scope);
            }
            other => return Err(UsageError::UnknownFlag(other.to_owned())),
        }
    }

    if redirect_uris.is_empty() {
        return Err(UsageError::MissingFlag("--redirect-uri"));
    }

    Ok(Command::Register(Box::new(Registration {
        id: id.ok_or(UsageError::MissingFlag("--id"))?,
        name: name.ok_or(UsageError::MissingFlag("--name"))?,
        kind: kind.ok_or(UsageError::MissingFlag("--kind"))?,
        redirect_uris,
        post_logout_redirect_uris,
        first_party,
        guest_login_allowed,
        scopes,
    })))
}

fn value(
    args: &mut impl Iterator<Item = String>,
    flag: &'static str,
) -> Result<String, UsageError> {
    args.next().ok_or(UsageError::MissingValue(flag))
}

fn redirect_uri(
    args: &mut impl Iterator<Item = String>,
    flag: &'static str,
) -> Result<RedirectUri, UsageError> {
    let value = value(args, flag)?;
    RedirectUri::try_new(value.clone()).map_err(|source| UsageError::InvalidRedirectUri {
        flag,
        value,
        source,
    })
}

#[derive(Debug, Error, miette::Diagnostic)]
enum ClientCliError {
    #[error(transparent)]
    #[diagnostic(code(cas_client::logger_error))]
    Logger(#[from] tracing_subscriber::util::TryInitError),

    #[error(transparent)]
    #[diagnostic(code(cas_client::config_error))]
    Config(#[from] ConfigError),

    #[error("Failed to connect to the database: {0}")]
    #[diagnostic(
        code(cas_client::connect_error),
        help("is Postgres running and DATABASE_URL correct?")
    )]
    Connect(sqlx::Error),

    #[error(transparent)]
    #[diagnostic(
        code(cas_client::register_error),
        help("an id is registered once: choose another id, or reset the dev database")
    )]
    Register(#[from] RegisterError),
}

#[tokio::main]
async fn main() -> miette::Result<()> {
    // A command line that could not be understood never reaches the database,
    // and exits with its own code rather than as a failed registration.
    let command = match parse(std::env::args().skip(1)) {
        Ok(command) => command,
        Err(error) => {
            eprintln!("{USAGE}\n\nerror: {error}");
            std::process::exit(USAGE_EXIT_CODE);
        }
    };

    // Everything else is a `miette` diagnostic on stderr, as in `cas-migrate`,
    // so stdout stays the secret's channel.
    run(command).await?;
    Ok(())
}

async fn run(command: Command) -> Result<(), ClientCliError> {
    let Command::Register(registration) = command;

    load_env_files();

    // To stderr, unlike the server's: the service logs the registration at
    // `info`, and that line must not land in what a script captures.
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init()
        .map_err(ClientCliError::Logger)?;

    let config = Config::from_env().map_err(ClientCliError::Config)?;

    // Eager connect: fail fast with a readable error instead of on first
    // query, as `cas-migrate` does.
    let pool = PgPoolOptions::new()
        .connect(&config.database_url)
        .await
        .map_err(ClientCliError::Connect)?;

    let registered = register(&pool, *registration).await?;

    println!("client_id: {}", registered.client.id);
    println!("kind: {}", registered.client.kind.as_str());
    if let Some(secret) = registered.secret {
        println!("client_secret: {}", secret.expose());
        println!("Store it now: it is not kept and cannot be shown again.");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cas::clients::ClientKind;

    fn parse_args(args: &[&str]) -> Result<Registration, UsageError> {
        parse(args.iter().map(|arg| (*arg).to_owned())).map(|command| {
            let Command::Register(registration) = command;
            *registration
        })
    }

    /// `Registration` is not `PartialEq` — it holds no answer worth comparing
    /// — so the rejection tests assert on the error alone.
    fn parse_error(args: &[&str]) -> UsageError {
        parse_args(args).expect_err("the command line is refused")
    }

    fn minimal() -> Vec<&'static str> {
        vec![
            "register",
            "--id",
            "ligretto",
            "--name",
            "Ligretto",
            "--kind",
            "confidential",
            "--redirect-uri",
            "http://localhost:5173/oidc/callback",
        ]
    }

    #[test]
    fn parses_a_full_command_line() {
        let registration = parse_args(&[
            "register",
            "--id",
            "ligretto",
            "--name",
            "Ligretto",
            "--kind",
            "confidential",
            "--redirect-uri",
            "http://localhost:5173/oidc/callback",
            "--redirect-uri",
            "https://ligretto.example/oidc/callback",
            "--post-logout-redirect-uri",
            "http://localhost:5173/",
            "--first-party",
            "--guest-login-allowed",
            "--scope",
            "openid",
            "--scope",
            "profile",
        ])
        .unwrap();

        assert_eq!(registration.id.as_str(), "ligretto");
        assert_eq!(registration.name.as_str(), "Ligretto");
        assert_eq!(registration.kind, ClientKind::Confidential);
        assert_eq!(
            registration
                .redirect_uris
                .iter()
                .map(|uri| uri.as_str())
                .collect::<Vec<_>>(),
            [
                "http://localhost:5173/oidc/callback",
                "https://ligretto.example/oidc/callback"
            ]
        );
        assert_eq!(
            registration
                .post_logout_redirect_uris
                .iter()
                .map(|uri| uri.as_str())
                .collect::<Vec<_>>(),
            ["http://localhost:5173/"]
        );
        assert!(registration.first_party);
        assert!(registration.guest_login_allowed);
        assert_eq!(
            registration
                .scopes
                .iter()
                .map(|scope| scope.as_str())
                .collect::<Vec<_>>(),
            ["openid", "profile"]
        );
    }

    /// The flags that are not given are the defaults the service applies: no
    /// logout URI, not first party, no guest grant, and the default scope
    /// (which `register` fills in, so the parsed list is empty).
    #[test]
    fn omitted_flags_leave_the_defaults() {
        let registration = parse_args(&minimal()).unwrap();

        assert!(registration.post_logout_redirect_uris.is_empty());
        assert!(!registration.first_party);
        assert!(!registration.guest_login_allowed);
        assert!(registration.scopes.is_empty());
    }

    #[test]
    fn a_subcommand_is_required() {
        assert_eq!(parse_error(&[]), UsageError::MissingSubcommand);
        assert_eq!(
            parse_error(&["--help"]),
            UsageError::UnknownSubcommand("--help".to_owned())
        );
        assert_eq!(
            parse_error(&["list"]),
            UsageError::UnknownSubcommand("list".to_owned())
        );
    }

    #[test]
    fn a_missing_required_flag_is_named() {
        for (flag, position) in [("--id", 1), ("--name", 3), ("--kind", 5)] {
            let mut args = minimal();
            args.drain(position..position + 2);

            assert_eq!(parse_error(&args), UsageError::MissingFlag(flag));
        }

        let mut args = minimal();
        args.drain(7..9);
        assert_eq!(
            parse_error(&args),
            UsageError::MissingFlag("--redirect-uri")
        );
    }

    #[test]
    fn a_flag_without_its_value_is_named() {
        for flag in [
            "--id",
            "--name",
            "--kind",
            "--redirect-uri",
            "--post-logout-redirect-uri",
            "--scope",
        ] {
            assert_eq!(
                parse_error(&["register", flag]),
                UsageError::MissingValue(flag),
                "{flag}"
            );
        }
    }

    #[test]
    fn an_unknown_flag_is_named() {
        let mut args = minimal();
        args.push("--secret");

        assert_eq!(
            parse_error(&args),
            UsageError::UnknownFlag("--secret".to_owned())
        );
    }

    #[test]
    fn an_invalid_value_reports_the_domain_rule() {
        let mut args = minimal();
        args[2] = "Ligretto";
        assert_eq!(
            parse_error(&args),
            UsageError::InvalidId(ClientIdError::DisallowedCharacter)
        );

        let mut args = minimal();
        args[6] = "other";
        assert_eq!(parse_error(&args), UsageError::InvalidKind(ClientKindError));

        let mut args = minimal();
        args[8] = "/oidc/callback";
        assert_eq!(
            parse_error(&args),
            UsageError::InvalidRedirectUri {
                flag: "--redirect-uri",
                value: "/oidc/callback".to_owned(),
                source: RedirectUriError::NotAbsolute,
            }
        );

        let mut args = minimal();
        args.extend(["--post-logout-redirect-uri", "ftp://app.example/"]);
        assert_eq!(
            parse_error(&args),
            UsageError::InvalidRedirectUri {
                flag: "--post-logout-redirect-uri",
                value: "ftp://app.example/".to_owned(),
                source: RedirectUriError::UnsupportedScheme,
            }
        );

        let mut args = minimal();
        args.extend(["--scope", "open id"]);
        assert_eq!(
            parse_error(&args),
            UsageError::InvalidScope {
                value: "open id".to_owned(),
                source: ScopeError::DisallowedCharacter,
            }
        );

        let mut args = minimal();
        args[4] = "";
        assert!(matches!(parse_error(&args), UsageError::InvalidName(_)));
    }
}
