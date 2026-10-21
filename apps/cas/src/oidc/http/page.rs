//! What the browser-facing endpoints, `/oidc/authorize` and `/oidc/end_session`,
//! answer with besides a redirect to a trusted address: the pages for the
//! conditions this context can name (ADR 0010 (a), ADR 0013 (g)), and the
//! redirect that carries the protocol's parameters back to the client.
//!
//! The page's shape, its fallback and the plain `302` are the transport
//! root's ([`crate::http::page`]), shared with every other endpoint a browser
//! navigates to.

use axum::http::StatusCode;
use axum::response::Response;
use url::form_urlencoded;

pub(super) use crate::http::page::{
    ErrorPage, HeadRefused, found, location_header, method_not_allowed,
};
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

/// The pages for the conditions the OIDC endpoints can name before the
/// client's redirect URI is trusted.
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

    /// The pages for conditions the code can name, for the description. The
    /// family's fallback is added by
    /// [`ErrorPage::responses`](crate::http::page::ErrorPage::responses) and
    /// is not among them.
    pub(super) const DECLARED: [Self; 4] = [
        Self::UNKNOWN_CLIENT,
        Self::INVALID_REDIRECT_URI,
        Self::INVALID_REQUEST,
        Self::SERVICE_UNAVAILABLE,
    ];

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
}
