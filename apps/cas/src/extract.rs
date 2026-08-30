use axum::extract::FromRequest;

use crate::error::ApiError;

/// JSON body extractor whose rejections render as [`ApiError`] instead of
/// axum's plain-text responses. Use for request bodies; responses can keep
/// using `axum::Json`.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct Json<T>(pub T);
