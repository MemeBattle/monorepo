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
