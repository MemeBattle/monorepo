use axum::extract::{FromRequest, FromRequestParts, OriginalUri};
use axum::http::{Extensions, Uri};

use crate::http::error::ApiError;

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

/// JSON body extractor whose rejections render as [`ApiError`] instead of
/// axum's plain-text responses. Use for request bodies; responses can keep
/// using `axum::Json`.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct Json<T>(pub T);

/// Path extractor whose rejections render as [`ApiError`]: a segment that
/// does not parse (a passkey id that is not a uuid) is a 400 in the standard
/// shape instead of axum's plain text.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(ApiError))]
pub struct Path<T>(pub T);
