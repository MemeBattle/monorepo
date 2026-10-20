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
//!
//! `--secret` is the one exception, and it exists in development builds only:
//! `scripts/seed-dev.sh` gives `ligretto` the stable secret the monorepo's
//! `.env.development` holds, so a fresh database agrees with the checked-in
//! development configuration without anyone copying a printed value. A
//! release build refuses the flag by name, as it has no development signing
//! key to start on. See `docs/adr/0023-dev-only-client-secret.md`.

use sqlx::postgres::PgPoolOptions;
use thiserror::Error;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use cas::clients::registration::register;
use cas::clients::{
    Audience, ClientId, ClientIdError, ClientKindError, ClientName, ClientNameError, ClientSecret,
    GuestGrantsPerMinute, RedirectUri, RedirectUriError, RegisterError, Registration, Scope,
    ScopeError,
};
// A chosen secret exists in the development build alone, and with it the
// error of refusing one and the kind it is cross-checked against; a release
// build refuses the flag before either matters.
#[cfg(debug_assertions)]
use cas::clients::{ClientKind, DevClientSecretError};
use cas::config::{Config, ConfigError, load_env_files};

const USAGE: &str = "\
cas-client register --id <client_id> --name <name> --kind <public|confidential>
                    --redirect-uri <uri> [--redirect-uri <uri>]...
                    [--post-logout-redirect-uri <uri>]...
                    [--first-party]
                    [--guest-login-allowed [--guest-grants-per-minute <n>]]
                    [--scope <scope>]... [--audience <resource>]
                    [--secret <value>]

Registers an OIDC client. --scope defaults to 'openid', --audience to the
client id, --guest-grants-per-minute to 60. A confidential client's secret
is printed once and cannot be shown again.

--secret sets that secret instead of drawing one, for a known value in a
development database (scripts/seed-dev.sh). It exists in development builds
only; a release build refuses it.";

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

    #[error("--audience: {0}")]
    InvalidAudience(ClientIdError),

    #[error("--guest-grants-per-minute {0:?}: must be a positive integer")]
    InvalidGuestGrantsPerMinute(String),

    /// A limit for a grant the client may not use is a mistake, not a
    /// default to keep.
    #[error("--guest-grants-per-minute needs --guest-login-allowed")]
    GuestGrantsPerMinuteWithoutGuestLogin,

    #[cfg(debug_assertions)]
    #[error("--secret: {0}")]
    InvalidSecret(DevClientSecretError),

    /// A public client authenticates with PKCE alone and has no secret, so a
    /// value for one is a mistake, not a value to drop. `register` refuses
    /// the same combination.
    #[cfg(debug_assertions)]
    #[error("--secret needs --kind confidential")]
    SecretNeedsConfidentialKind,

    /// A chosen secret can be constructed in a development build alone, so a
    /// release build names the flag rather than calling it unknown: the
    /// operator is not mistyping, the build is the wrong one
    /// (`docs/adr/0023-dev-only-client-secret.md`).
    #[cfg(not(debug_assertions))]
    #[error("--secret is available in development builds only")]
    SecretIsDevelopmentOnly,
}

/// Parses the command line by hand: one subcommand and ten flags is less
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
    let mut guest_grants_per_minute = None;
    let mut scopes = Vec::new();
    let mut audience = None;
    let mut secret = None;

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
            "--guest-grants-per-minute" => {
                let value = value(&mut args, "--guest-grants-per-minute")?;
                let limit = value
                    .parse()
                    .ok()
                    .and_then(|limit| GuestGrantsPerMinute::try_new(limit).ok())
                    .ok_or(UsageError::InvalidGuestGrantsPerMinute(value))?;
                guest_grants_per_minute = Some(limit);
            }
            "--scope" => {
                let value = value(&mut args, "--scope")?;
                let scope = Scope::try_new(value.clone())
                    .map_err(|source| UsageError::InvalidScope { value, source })?;
                scopes.push(scope);
            }
            "--audience" => {
                let value = value(&mut args, "--audience")?;
                audience = Some(Audience::try_new(value).map_err(UsageError::InvalidAudience)?);
            }
            "--secret" => {
                secret = Some(secret_value(&mut args)?);
            }
            other => return Err(UsageError::UnknownFlag(other.to_owned())),
        }
    }

    if redirect_uris.is_empty() {
        return Err(UsageError::MissingFlag("--redirect-uri"));
    }
    if guest_grants_per_minute.is_some() && !guest_login_allowed {
        return Err(UsageError::GuestGrantsPerMinuteWithoutGuestLogin);
    }
    // In a release build `--secret` is refused above, so there is nothing
    // left to cross-check and the variant does not exist.
    #[cfg(debug_assertions)]
    if secret.is_some() && kind == Some(ClientKind::Public) {
        return Err(UsageError::SecretNeedsConfidentialKind);
    }

    Ok(Command::Register(Box::new(Registration {
        id: id.ok_or(UsageError::MissingFlag("--id"))?,
        name: name.ok_or(UsageError::MissingFlag("--name"))?,
        kind: kind.ok_or(UsageError::MissingFlag("--kind"))?,
        redirect_uris,
        post_logout_redirect_uris,
        first_party,
        guest_login_allowed,
        guest_grants_per_minute,
        scopes,
        audience,
        secret,
    })))
}

/// The value of `--secret`, which a development build may turn into a chosen
/// [`ClientSecret`]. Two bodies rather than one with a branch: the release
/// build must not be able to construct one at all
/// (`docs/adr/0023-dev-only-client-secret.md`).
#[cfg(debug_assertions)]
fn secret_value(args: &mut impl Iterator<Item = String>) -> Result<ClientSecret, UsageError> {
    let value = value(args, "--secret")?;
    ClientSecret::try_dev(value).map_err(UsageError::InvalidSecret)
}

/// Refused before the value is consumed, so a release operator reads why the
/// flag is gone rather than which argument was unknown.
#[cfg(not(debug_assertions))]
fn secret_value(_args: &mut impl Iterator<Item = String>) -> Result<ClientSecret, UsageError> {
    Err(UsageError::SecretIsDevelopmentOnly)
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
    println!("audience: {}", registered.client.audience);
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
            "--audience",
            "backend",
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
        assert_eq!(registration.audience.unwrap().as_str(), "backend");
    }

    /// The flags that are not given are the defaults the service applies: no
    /// logout URI, not first party, no guest grant, and the default scope
    /// (which `register` fills in, so the parsed list is empty), the client's
    /// own id as its audience (`None` here, filled in likewise), and a
    /// generated secret (`None` likewise).
    #[test]
    fn omitted_flags_leave_the_defaults() {
        let registration = parse_args(&minimal()).unwrap();

        assert!(registration.post_logout_redirect_uris.is_empty());
        assert!(!registration.first_party);
        assert!(!registration.guest_login_allowed);
        assert!(registration.guest_grants_per_minute.is_none());
        assert!(registration.scopes.is_empty());
        assert!(registration.audience.is_none());
        assert!(registration.secret.is_none());
    }

    #[test]
    fn parses_a_guest_limit_next_to_the_guest_grant() {
        let mut args = minimal();
        args.extend(["--guest-login-allowed", "--guest-grants-per-minute", "5"]);

        let registration = parse_args(&args).unwrap();

        assert!(registration.guest_login_allowed);
        assert_eq!(
            registration.guest_grants_per_minute,
            Some(GuestGrantsPerMinute::try_new(5).unwrap())
        );
    }

    #[test]
    fn a_guest_limit_must_be_a_positive_integer() {
        for value in ["0", "-1", "abc", "1.5", "", "99999999999"] {
            let mut args = minimal();
            args.extend(["--guest-login-allowed", "--guest-grants-per-minute", value]);

            assert_eq!(
                parse_error(&args),
                UsageError::InvalidGuestGrantsPerMinute(value.to_owned()),
                "{value:?}"
            );
        }
    }

    #[test]
    fn a_guest_limit_without_the_guest_grant_is_refused() {
        let mut args = minimal();
        args.extend(["--guest-grants-per-minute", "5"]);

        assert_eq!(
            parse_error(&args),
            UsageError::GuestGrantsPerMinuteWithoutGuestLogin
        );
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
            "--audience",
            "--guest-grants-per-minute",
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
        args.push("--rotate");

        assert_eq!(
            parse_error(&args),
            UsageError::UnknownFlag("--rotate".to_owned())
        );
    }

    /// `--secret` exists in this build, so the whole of its behaviour is
    /// tested here; the release build's refusal is the test below it. Tests
    /// run in both profiles (`cargo test --release`), so each is gated.
    #[cfg(debug_assertions)]
    #[test]
    fn a_given_secret_is_the_one_registered() {
        let mut args = minimal();
        args.extend(["--secret", "dev-only-ligretto-secret"]);

        let registration = parse_args(&args).unwrap();

        assert_eq!(
            registration.secret.map(|secret| secret.expose().to_owned()),
            Some("dev-only-ligretto-secret".to_owned())
        );
    }

    #[cfg(debug_assertions)]
    #[test]
    fn a_secret_for_a_public_client_is_refused() {
        let mut args = minimal();
        args[6] = "public";
        args.extend(["--secret", "dev-only-ligretto-secret"]);

        assert_eq!(parse_error(&args), UsageError::SecretNeedsConfidentialKind);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn an_empty_secret_is_refused() {
        let mut args = minimal();
        args.extend(["--secret", ""]);

        assert_eq!(
            parse_error(&args),
            UsageError::InvalidSecret(DevClientSecretError::Empty)
        );
    }

    /// Listed apart from `a_flag_without_its_value_is_named`, whose flags are
    /// the same in either build.
    #[cfg(debug_assertions)]
    #[test]
    fn a_secret_without_its_value_is_named() {
        assert_eq!(
            parse_error(&["register", "--secret"]),
            UsageError::MissingValue("--secret")
        );
    }

    /// The release refusal, named rather than "unknown flag", and reached
    /// before a value is even read.
    #[cfg(not(debug_assertions))]
    #[test]
    fn the_secret_flag_is_refused_by_a_release_build() {
        let mut args = minimal();
        args.extend(["--secret", "dev-only-ligretto-secret"]);
        assert_eq!(parse_error(&args), UsageError::SecretIsDevelopmentOnly);

        assert_eq!(
            parse_error(&["register", "--secret"]),
            UsageError::SecretIsDevelopmentOnly
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
        args.extend(["--audience", "https://api.example"]);
        assert_eq!(
            parse_error(&args),
            UsageError::InvalidAudience(ClientIdError::DisallowedCharacter)
        );

        let mut args = minimal();
        args[4] = "";
        assert!(matches!(parse_error(&args), UsageError::InvalidName(_)));
    }
}
