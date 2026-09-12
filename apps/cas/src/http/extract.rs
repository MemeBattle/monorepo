use axum::extract::{FromRequest, FromRequestParts};

use crate::http::error::ApiError;

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
