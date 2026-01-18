use std::{collections::HashMap, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{net::TcpListener, sync::Mutex};
use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::{self, TraceLayer},
};
use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, Passkey, PasskeyRegistration, RegisterPublicKeyCredential, Url,
};

#[derive(Debug, Error, miette::Diagnostic)]
enum CasError {
    #[error(transparent)]
    #[diagnostic(code(cas::io_error))]
    IoError(#[from] std::io::Error),

    #[error(transparent)]
    #[diagnostic(code(cas::init_error))]
    InitError(#[from] CasInitError),
}

#[derive(Debug, Error, miette::Diagnostic)]
enum CasInitError {
    #[error(transparent)]
    #[diagnostic(code(cas::init_error))]
    LoggerInitError(#[from] tracing_subscriber::util::TryInitError),
}

#[tokio::main]
async fn main() -> miette::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_env("CAS_LOG_LEVEL"))
        .try_init()
        .map_err(CasInitError::LoggerInitError)?;

    let listener = TcpListener::bind("0.0.0.0:3000")
        .await
        .map_err(CasError::IoError)?;

    axum::serve(listener, app())
        .await
        .map_err(CasError::IoError)?;

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct UserId(Uuid);
#[derive(Clone)]
struct ApiState {
    registration_state: Arc<Mutex<HashMap<UserId, PasskeyRegistration>>>,
    webauthn: webauthn_rs::Webauthn,
}

fn app() -> Router {
    let cors_layer = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
        .allow_methods(Any)
        .allow_headers(Any);
    let middleware_stack = ServiceBuilder::new()
        .layer(
            TraceLayer::new_for_http().on_response(
                trace::DefaultOnResponse::new()
                    .include_headers(true)
                    .level(Level::INFO),
            ),
        )
        .layer(cors_layer);

    let registration_state = Arc::new(Mutex::new(HashMap::<UserId, PasskeyRegistration>::new()));
    let webauthn = webauthn_rs::WebauthnBuilder::new(
        "localhost",
        &"http://localhost:5173".parse::<Url>().unwrap(),
    )
    .unwrap()
    .build()
    .unwrap();

    Router::new().route("/health", get(health_check)).nest(
        "/api",
        Router::new()
            .route("/webauthn/register-options", post(get_registration_options))
            .route("/webauthn/verify-registration", post(verify_registration))
            .layer(middleware_stack)
            .with_state(ApiState {
                registration_state,
                webauthn,
            }),
    )
}

async fn health_check() -> &'static str {
    "OK"
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistrationOptionsResponse {
    registration_id: String,
    ccr: CreationChallengeResponse,
}

#[derive(Debug, Error, miette::Diagnostic)]
enum RegistrationError {
    #[diagnostic(code(cas::registration_error))]
    #[error("Failed to generate registration options: {0}")]
    GenerateRegistrationOptionsError(webauthn_rs::prelude::WebauthnError),

    #[diagnostic(code(cas::verify_registration_error))]
    #[error("Failed to verify registration: {0}")]
    VerifyRegistrationError(webauthn_rs::prelude::WebauthnError),
}

impl IntoResponse for RegistrationError {
    fn into_response(self) -> Response {
        match self {
            RegistrationError::GenerateRegistrationOptionsError(e) => {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(e.to_string())).into_response()
            }
            RegistrationError::VerifyRegistrationError(e) => {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(e.to_string())).into_response()
            }
        }
    }
}

async fn get_registration_options(
    State(state): State<ApiState>,
) -> Result<Json<RegistrationOptionsResponse>, RegistrationError> {
    let user_id = Uuid::new_v4();
    let (ccr, skr) = state
        .webauthn
        .start_passkey_registration(user_id, "testuser", "testuser", None)
        .map_err(RegistrationError::GenerateRegistrationOptionsError)?;
    state
        .registration_state
        .lock()
        .await
        .insert(UserId(user_id), skr);

    Ok(Json(RegistrationOptionsResponse {
        registration_id: user_id.to_string(),
        ccr,
    }))
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyRegistrationData {
    registration_id: String,
    response: RegisterPublicKeyCredential,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyRegistrationResponse(Passkey);

async fn verify_registration(
    State(state): State<ApiState>,
    Json(data): Json<VerifyRegistrationData>,
) -> Result<Json<VerifyRegistrationResponse>, RegistrationError> {
    let user_id = Uuid::parse_str(&data.registration_id).unwrap();
    let skr = state
        .registration_state
        .lock()
        .await
        .remove(&UserId(user_id))
        .expect("Registration state not found");

    let result = state
        .webauthn
        .finish_passkey_registration(&data.response, &skr)
        .map_err(RegistrationError::VerifyRegistrationError)?;

    Ok(Json(VerifyRegistrationResponse(result)))
}
