use std::collections::BTreeMap;

use axum::extract::{FromRequest, FromRequestParts, OriginalUri};
use axum::http::{Extensions, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use utoipa::openapi::{RefOr, response::Response as OpenApiResponse};

use crate::http::error::{ApiError, ErrorCodes, INVALID_BODY, INVALID_PATH};
use crate::http::response::json_response;

/// The path as the client sent it, for a log line. A nested router strips
/// its prefix from the request URI before its layers and extractors run, so
/// inside `/api` the URI says `/me` where the log needs `/api/me`; axum
/// keeps the original in [`OriginalUri`]. Outside a nested router there is
/// no extension, and the URI itself is the original.
pub(crate) fn original_path<'r>(extensions: &'r Extensions, uri: &'r Uri) -> &'r str {
    extensions
        .get::<OriginalUri>()
        .map_or(uri.path(), |original| original.0.path())
}

/// The value a request presents under the cookie called `name`, or `None`
/// when it presents nothing under that name. Read straight from the `Cookie`
/// header(s) with the name compared byte for byte, without percent-decoding.
///
/// The decoding jar (`axum_extra::extract::CookieJar`) is not used here on
/// purpose. It percent-decodes names, so `%5F%5FHost-cas_session` would be
/// read as `__Host-cas_session`, while a browser keeps names as written
/// (RFC 6265bis §5.6) and applies the `__Host-` rules only to a name that
/// literally starts with the prefix. A sibling subdomain could therefore set
/// a domain-wide cookie under the encoded spelling, which the browser would
/// accept and send here, and a decoding lookup would take it for the real
/// one: cookie tossing through the back door the prefix is meant to close.
/// Matching the wire name shuts it.
///
/// It lives here rather than with either cookie because the rule holds for
/// every cookie CAS reads — the session cookie
/// ([`CookieSettings::presented`](crate::sessions::http::CookieSettings::presented))
/// and the identity flow cookie — and a second copy of it could only drift.
pub(crate) fn presented_cookie(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(axum::http::header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(axum_extra::extract::cookie::Cookie::split_parse)
        .filter_map(Result::ok)
        .find(|cookie| cookie.name() == name)
        .map(|cookie| cookie.value().to_owned())
}

/// JSON in both directions. As an extractor, its rejections render as
/// [`ApiError`] instead of axum's plain-text responses (declare
/// [`InvalidBody`] in the handler's error set). As a response, it is
/// `axum::Json` described as a `200` with `T`'s schema. One name both ways,
/// and the name utoipa recognises a request body by.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct Json<T>(pub T);

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response {
        axum::Json(self.0).into_response()
    }
}

impl<T: utoipa::ToSchema> utoipa::IntoResponses for Json<T> {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        BTreeMap::from([(
            StatusCode::OK.as_str().to_owned(),
            RefOr::T(json_response("OK", &T::name())),
        )])
    }
}

/// Path extractor whose rejections render as [`ApiError`]: a segment that
/// does not parse (a passkey id that is not a uuid) is a 400 in the standard
/// shape instead of axum's plain text. Declare [`InvalidPath`] in the
/// handler's error set.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(ApiError))]
pub struct Path<T>(pub T);

/// What a handler taking [`Json`] answers when the body is refused: the
/// statuses a `JsonRejection` carries — not JSON (400), too large (413),
/// not `application/json` (415), not the expected shape (422).
pub struct InvalidBody;

impl ErrorCodes for InvalidBody {
    fn codes() -> Vec<(StatusCode, &'static str)> {
        [
            StatusCode::BAD_REQUEST,
            StatusCode::PAYLOAD_TOO_LARGE,
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            StatusCode::UNPROCESSABLE_ENTITY,
        ]
        .into_iter()
        .map(|status| (status, INVALID_BODY))
        .collect()
    }
}

/// What a handler taking [`Path`] answers when a segment does not parse.
pub struct InvalidPath;

impl ErrorCodes for InvalidPath {
    fn codes() -> Vec<(StatusCode, &'static str)> {
        vec![(StatusCode::BAD_REQUEST, INVALID_PATH)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::http::header;

    /// The same answer `axum::Json` gave.
    #[tokio::test]
    async fn json_answers_as_axum_json() {
        let response = Json(serde_json::json!({"a": [1, 2]})).into_response();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&bytes[..], br#"{"a":[1,2]}"#);
    }
}
