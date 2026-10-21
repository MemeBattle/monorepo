//! What an endpoint a browser *navigates* to answers, as opposed to one the
//! frontend calls with `fetch`: the `302` itself, the `405` for a `HEAD`, and
//! CAS's own error page for a failure it cannot send on to a trusted address.
//!
//! It lives in the transport root because more than one context has such an
//! endpoint — `/oidc/authorize` and `/oidc/end_session` (ADR 0010 (a), ADR
//! 0013 (g)), the provider callback of `identities` (ADR 0023 (h)) — and a
//! browser must meet one answer, not one per context. Each context declares
//! the pages for the conditions it can name; the shape, the fallback and the
//! description are here.

use std::collections::BTreeMap;

use axum::{
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use utoipa::openapi::{RefOr, header::Header, response::Response as OpenApiResponse};

use crate::db::Failure;
use crate::http::error::{ErrorCode, SERVICE_UNAVAILABLE};
use crate::http::response::{ErrorShape, error_responses, string_header};

/// `302` to `location`.
pub(crate) fn found(location: &str) -> Response {
    match HeaderValue::from_str(location) {
        Ok(location) => (StatusCode::FOUND, [(header::LOCATION, location)]).into_response(),
        // Every address a caller builds here is either a validated URL or a
        // registered redirect URI with percent-encoded values appended, so
        // this is a bug, not a request to name.
        Err(error) => {
            tracing::error!(error = %error, "a redirect location is not a header value");
            ErrorPage::INTERNAL.into_response()
        }
    }
}

/// `405` naming the methods the endpoint serves. Every navigation endpoint
/// refuses `HEAD` with it: axum would otherwise serve it from the `GET`
/// handler, and a `HEAD` must not act for a response nobody reads.
pub(crate) fn method_not_allowed(allow: &'static str) -> Response {
    (StatusCode::METHOD_NOT_ALLOWED, [(header::ALLOW, allow)]).into_response()
}

/// CAS's own answer to a navigation it cannot send onwards: a minimal
/// document of fixed strings. Nothing from the request is rendered, so no
/// escaping question arises.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ErrorPage {
    pub(crate) status: StatusCode,
    pub(crate) code: &'static str,
    pub(crate) title: &'static str,
    pub(crate) description: &'static str,
}

impl ErrorPage {
    /// A service that is there but cannot serve: the page for a database
    /// failure `crate::db::classify` names retryable.
    pub(crate) const SERVICE_UNAVAILABLE: Self = Self {
        status: StatusCode::SERVICE_UNAVAILABLE,
        code: SERVICE_UNAVAILABLE,
        title: "Service unavailable",
        description: "The service is temporarily unavailable. Try again later.",
    };

    /// The family's fallback, for what no branch can name. Declared on every
    /// navigation endpoint by [`responses`](Self::responses) rather than by a
    /// context's list.
    pub(crate) const INTERNAL: Self = Self {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        code: "internal",
        title: "Something went wrong",
        description: "The service could not handle the request.",
    };

    /// The responses of `declared` plus the fallback's: what a navigation
    /// endpoint answers besides a redirect.
    pub(crate) fn responses(declared: &[Self]) -> BTreeMap<String, RefOr<OpenApiResponse>> {
        let mut codes: Vec<(StatusCode, &'static str)> = declared
            .iter()
            .map(|page| (page.status, page.code))
            .collect();
        codes.push((Self::INTERNAL.status, Self::INTERNAL.code));
        error_responses(&codes, ErrorShape::Page)
    }

    /// The page for a database failure: `503` when [`crate::db::classify`]
    /// names it retryable, `500` otherwise.
    pub(crate) fn for_database(error: &sqlx::Error) -> Self {
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
pub(crate) enum HeadRefused {
    /// `HEAD` is refused: it must not act for a response nobody reads.
    #[response(
        status = 405,
        headers(("Allow" = String, description = "The methods the endpoint serves."))
    )]
    MethodNotAllowed,
}

/// The `Location` of a `302`, for the descriptions that list one.
pub(crate) fn location_header() -> Header {
    string_header("Where the browser goes next.")
}
