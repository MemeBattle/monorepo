//! The CAS under test: the real `cas::http::app`, served over TCP on a port
//! of its own against the test's throwaway database.

use std::net::Ipv4Addr;
use std::time::Duration;

use ::cas::clients::registration::register;
use ::cas::clients::{Registered, Registration};
use ::cas::config::{Config, SigningKeyPem};
use axum::http::HeaderValue;
use axum::{ServiceExt, extract::Request};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, PgPool};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

/// Where the frontend is served: the WebAuthn origin, the origin the CSRF
/// line under `/api` admits, and the origin of CAS's sign-in and
/// create-account screens.
pub const FRONTEND_ORIGIN: &str = "http://localhost:5173";
const RP_ID: &str = "localhost";

/// How long `stop` waits for the server to drain before aborting it.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

pub struct Cas {
    issuer: String,
    /// For registering clients, as `cas-client` does. The server has its own.
    pool: PgPool,
    shutdown: oneshot::Sender<()>,
    server: JoinHandle<std::io::Result<()>>,
}

impl Cas {
    /// Serves CAS on `127.0.0.1` at a free port, with the issuer on that
    /// port and the checked-in development signing key.
    pub async fn start(options: &PgConnectOptions) -> Self {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("a free local port");
        let port = listener
            .local_addr()
            .expect("a bound listener has an address")
            .port();
        let issuer = format!("http://127.0.0.1:{port}");
        let config = Config {
            port,
            rp_id: RP_ID.to_owned(),
            origin: FRONTEND_ORIGIN.parse().expect("a valid origin"),
            cors_origins: vec![HeaderValue::from_static(FRONTEND_ORIGIN)],
            database_url: options.to_url_lossy().to_string(),
            issuer: issuer.clone(),
            signing_key: Some(SigningKeyPem::new(include_str!(
                "../../dev/signing-key.pem"
            ))),
        };
        let app = ::cas::http::app(config).expect("CAS builds from the test configuration");

        // Served the way `main.rs` serves it, with a way to stop.
        let (shutdown, signal) = oneshot::channel::<()>();
        let server = tokio::spawn(async move {
            axum::serve(listener, ServiceExt::<Request>::into_make_service(app))
                .with_graceful_shutdown(async {
                    let _ = signal.await;
                })
                .await
        });

        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .expect("the test database accepts a connection");

        Self {
            issuer,
            pool,
            shutdown,
            server,
        }
    }

    pub fn issuer(&self) -> &str {
        &self.issuer
    }

    /// Registers a client through the library's registration use case, the
    /// path `cas-client` takes, so a confidential client's secret is the one
    /// CAS generated.
    pub async fn register(&self, registration: Registration) -> Registered {
        register(&self.pool, registration)
            .await
            .expect("the client registers")
    }

    /// Stops the server and closes every pool on the test database, so
    /// `sqlx::test` can drop it. The test drops its HTTP clients first: an
    /// open keep-alive connection would hold the graceful shutdown.
    pub async fn stop(self) {
        self.pool.close().await;
        let _ = self.shutdown.send(());
        let mut server = self.server;
        match tokio::time::timeout(SHUTDOWN_TIMEOUT, &mut server).await {
            Ok(result) => result
                .expect("the server task does not panic")
                .expect("the server stops cleanly"),
            Err(_) => {
                eprintln!("CAS did not shut down within {SHUTDOWN_TIMEOUT:?}; aborting it");
                server.abort();
            }
        }
    }
}
