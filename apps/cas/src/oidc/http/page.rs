//! What the browser-facing endpoints, `/oidc/authorize` and `/oidc/end_session`,
//! answer with besides a redirect to a trusted address: CAS's own error page
//! (ADR 0010 (a), ADR 0013 (g)), the `302` itself, and the `405` for a
//! `HEAD`.

use std::collections::BTreeMap;

use axum::{
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use url::form_urlencoded;
use utoipa::openapi::{RefOr, header::Header, response::Response as OpenApiResponse};

use crate::db::Failure;
use crate::http::error::ErrorCode;
use crate::http::response::{ErrorShape, error_responses, string_header};
use crate::oidc::authorization::PageError;

/// `302` to `base` with `pairs` appended to its query: with `&` when the
/// registered URI already has one, `?` otherwise (RFC 6749 §4.1.2). Every
/// value is percent-encoded.
pub(super) fn redirect_with(base: &str, pairs: &[(&str, &str)]) -> Response {
    if pairs.is_empty() {
        return found(base);
    }
    let query = form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish();
    let separator = if base.contains('?') { '&' } else { '?' };
    found(&format!("{base}{separator}{query}"))
}

pub(super) fn found(location: &str) -> Response {
    match HeaderValue::from_str(location) {
        Ok(location) => (StatusCode::FOUND, [(header::LOCATION, location)]).into_response(),
        // A registered redirect URI is validated ASCII and every appended
        // value is percent-encoded, so this is a bug, not a request to
        // name.
        Err(error) => {
            tracing::error!(error = %error, "a redirect location is not a header value");
            ErrorPage::INTERNAL.into_response()
        }
    }
}

/// `405` naming the methods the endpoint serves. Both endpoints refuse
/// `HEAD` with it: axum would otherwise serve it from the `GET` handler,
/// and a `HEAD` must not act for a response nobody reads.
pub(super) fn method_not_allowed(allow: &'static str) -> Response {
    (StatusCode::METHOD_NOT_ALLOWED, [(header::ALLOW, allow)]).into_response()
}

/// CAS's own answer to a request it cannot send back to the client: a
/// minimal document of fixed strings. Nothing from the request is rendered,
/// so no escaping question arises.
#[derive(Debug, Clone, Copy)]
pub(super) struct ErrorPage {
    pub(super) status: StatusCode,
    pub(super) code: &'static str,
    pub(super) title: &'static str,
    pub(super) description: &'static str,
}

impl ErrorPage {
    pub(super) const UNKNOWN_CLIENT: Self = Self {
        status: StatusCode::BAD_REQUEST,
        code: "unknown_client",
        title: "Unknown application",
        description: "The application that sent you here is not registered with this service.",
    };

    pub(super) const INVALID_REDIRECT_URI: Self = Self {
        status: StatusCode::BAD_REQUEST,
        code: "invalid_redirect_uri",
        title: "Invalid return address",
        description: "The application that sent you here asked to return to an address it has not registered.",
    };

    pub(super) const INVALID_REQUEST: Self = Self {
        status: StatusCode::BAD_REQUEST,
        code: "invalid_request",
        title: "Invalid request",
        description: "The request is malformed.",
    };

    pub(super) const SERVICE_UNAVAILABLE: Self = Self {
        status: StatusCode::SERVICE_UNAVAILABLE,
        code: "service_unavailable",
        title: "Service unavailable",
        description: "The service is temporarily unavailable. Try again later.",
    };

    pub(super) const INTERNAL: Self = Self {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        code: "internal",
        title: "Something went wrong",
        description: "The service could not handle the request.",
    };

    /// The pages for conditions the code can name, for the description.
    /// [`Self::INTERNAL`] is the family's fallback and is not among them.
    pub(super) const DECLARED: [Self; 4] = [
        Self::UNKNOWN_CLIENT,
        Self::INVALID_REDIRECT_URI,
        Self::INVALID_REQUEST,
        Self::SERVICE_UNAVAILABLE,
    ];

    /// The responses of the pages, the fallback's included: what
    /// `/oidc/authorize` and `/oidc/end_session` answer besides a redirect.
    pub(super) fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        let mut codes: Vec<(StatusCode, &'static str)> = Self::DECLARED
            .iter()
            .map(|page| (page.status, page.code))
            .collect();
        codes.push((Self::INTERNAL.status, Self::INTERNAL.code));
        error_responses(&codes, ErrorShape::Page)
    }

    /// The page for a failure before the redirect address is trusted. A
    /// malformed request's description is one of the service's fixed
    /// strings.
    pub(super) fn for_error(error: PageError) -> Self {
        match error {
            PageError::UnknownClient => Self::UNKNOWN_CLIENT,
            PageError::InvalidRedirectUri => Self::INVALID_REDIRECT_URI,
            PageError::MalformedRequest(description) => Self {
                description,
                ..Self::INVALID_REQUEST
            },
        }
    }

    /// The page for a database failure: `503` when [`crate::db::classify`]
    /// names it retryable, `500` otherwise.
    pub(super) fn for_database(error: &sqlx::Error) -> Self {
        match crate::db::classify(error) {
            Some(Failure::Unavailable | Failure::Busy) => Self::SERVICE_UNAVAILABLE,
            None => Self::INTERNAL,
        }
    }
}

impl IntoResponse for ErrorPage {
    fn into_response(self) -> Response {
        let Self {
            status,
            code,
            title,
            description,
        } = self;
        let body = format!(
            "<!doctype html>\n\
             <html lang=\"en\">\n\
             <head>\n\
             <meta charset=\"utf-8\">\n\
             <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
             <title>{title}</title>\n\
             </head>\n\
             <body>\n\
             <h1>{title}</h1>\n\
             <p>{description}</p>\n\
             <p>Error code: <code>{code}</code></p>\n\
             </body>\n\
             </html>\n"
        );
        let mut response = (
            status,
            [(
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            )],
            body,
        )
            .into_response();
        response.extensions_mut().insert(ErrorCode(code));
        response
    }
}

/// The `405` a `HEAD` gets, for the description.
#[derive(utoipa::IntoResponses)]
#[allow(dead_code)] // Described, never built: `method_not_allowed` answers.
pub(super) enum HeadRefused {
    /// `HEAD` is refused: it must not act for a response nobody reads.
    #[response(
        status = 405,
        headers(("Allow" = String, description = "The methods the endpoint serves."))
    )]
    MethodNotAllowed,
}

/// The `Location` of a `302`, for the descriptions that list one.
pub(super) fn location_header() -> Header {
    string_header("Where the browser goes next.")
}
