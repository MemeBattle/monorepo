//! What handlers return, so that the OpenAPI description is read off the
//! return type (utoipa's `auto_into_responses`): every type here is both an
//! `IntoResponse` and a `utoipa::IntoResponses`, and the two halves sit
//! side by side. `Json` is in `http::extract`, being an extractor too.
//! See `docs/adr/0016-openapi-description.md`.

use std::collections::BTreeMap;
use std::marker::PhantomData;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use utoipa::openapi::{
    ContentBuilder, ObjectBuilder, Ref, RefOr, ResponseBuilder, Type,
    extensions::{Extensions, ExtensionsBuilder},
    header::Header,
    response::Response as OpenApiResponse,
};

/// The response extension that lists, on every error response of the
/// description, the stable codes the response can carry, whatever its body
/// looks like.
pub const ERROR_CODES_EXTENSION: &str = "x-error-codes";

/// The body an error family answers with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorShape {
    /// [`ApiError`](crate::http::error::ApiError):
    /// `{"error": {"code", "message"}}`, `code` an enum of the status's codes.
    Api,
    /// RFC 6749 §5.2 and RFC 6750 §3: `{"error", "error_description"}`,
    /// `error` an enum of the status's codes.
    OAuth,
    /// CAS's own HTML error page, the code in its text.
    Page,
}

/// The responses for `codes`: one per status, listing the status's codes
/// (sorted, each once) in [`ERROR_CODES_EXTENSION`] and, for a JSON shape,
/// as the enum of the code's schema. Every error response of the
/// description goes through here, so the two listings cannot disagree.
pub fn error_responses(
    codes: &[(StatusCode, &'static str)],
    shape: ErrorShape,
) -> BTreeMap<String, RefOr<OpenApiResponse>> {
    let mut by_status: BTreeMap<StatusCode, Vec<&'static str>> = BTreeMap::new();
    for (status, code) in codes {
        by_status.entry(*status).or_default().push(code);
    }
    by_status
        .into_iter()
        .map(|(status, mut codes)| {
            codes.sort_unstable();
            codes.dedup();
            (
                status.as_str().to_owned(),
                RefOr::T(error_response(&codes, shape)),
            )
        })
        .collect()
}

/// The [`ERROR_CODES_EXTENSION`] listing `codes`, sorted, each once.
pub fn error_codes(codes: &[&str]) -> Extensions {
    let mut codes = codes.to_vec();
    codes.sort_unstable();
    codes.dedup();
    ExtensionsBuilder::new()
        .add(ERROR_CODES_EXTENSION, codes)
        .build()
}

/// One error response for `codes`, which share a status.
pub fn error_response(codes: &[&str], shape: ErrorShape) -> OpenApiResponse {
    let builder = ResponseBuilder::new()
        .description(codes.join(", "))
        .extensions(Some(error_codes(codes)));
    match shape {
        ErrorShape::Api => builder.content(
            "application/json",
            ContentBuilder::new()
                .schema(Some(api_error_schema(codes)))
                .build(),
        ),
        ErrorShape::OAuth => builder.content(
            "application/json",
            ContentBuilder::new()
                .schema(Some(oauth_error_schema(codes)))
                .build(),
        ),
        ErrorShape::Page => builder.content(
            "text/html",
            ContentBuilder::new()
                .schema(Some(ObjectBuilder::new().schema_type(Type::String)))
                .build(),
        ),
    }
    .build()
}

/// `{"error": {"code": <one of codes>, "message": string}}`.
pub fn api_error_schema(codes: &[&str]) -> ObjectBuilder {
    let error = ObjectBuilder::new()
        .property("code", code_enum(codes))
        .required("code")
        .property(
            "message",
            ObjectBuilder::new()
                .schema_type(Type::String)
                .description(Some("For the developer; clients branch on `code`.")),
        )
        .required("message");
    ObjectBuilder::new()
        .property("error", error)
        .required("error")
}

/// `{"error": <one of codes>, "error_description": string}`.
pub fn oauth_error_schema(codes: &[&str]) -> ObjectBuilder {
    ObjectBuilder::new()
        .property("error", code_enum(codes))
        .required("error")
        .property(
            "error_description",
            ObjectBuilder::new().schema_type(Type::String),
        )
        .required("error_description")
}

fn code_enum(codes: &[&str]) -> ObjectBuilder {
    ObjectBuilder::new()
        .schema_type(Type::String)
        .enum_values(Some(codes.iter().copied()))
}

/// A string-valued response header, for the descriptions that list one.
pub fn string_header(description: &str) -> Header {
    let mut header = Header::new(ObjectBuilder::new().schema_type(Type::String));
    header.description = Some(description.to_owned());
    header
}

/// Adds `header` to every success (`2xx`) response of `responses`.
pub fn on_success(
    mut responses: BTreeMap<String, RefOr<OpenApiResponse>>,
    name: &str,
    header: Header,
) -> BTreeMap<String, RefOr<OpenApiResponse>> {
    for (status, response) in &mut responses {
        if let (true, RefOr::T(response)) = (status.starts_with('2'), response) {
            response
                .headers
                .insert(name.to_owned(), RefOr::T(header.clone()));
        }
    }
    responses
}

/// A response whose JSON body is the schema `name`, which the router's
/// document registers among its components.
pub fn json_response(description: &str, name: &str) -> OpenApiResponse {
    ResponseBuilder::new()
        .description(description)
        .content(
            "application/json",
            ContentBuilder::new()
                .schema(Some(Ref::from_schema_name(name)))
                .build(),
        )
        .build()
}

/// `201 Created` with a JSON body: what a handler returns for a resource it
/// made.
pub struct Created<T>(pub T);

impl<T: Serialize> IntoResponse for Created<T> {
    fn into_response(self) -> Response {
        (StatusCode::CREATED, axum::Json(self.0)).into_response()
    }
}

impl<T: utoipa::ToSchema> utoipa::IntoResponses for Created<T> {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        BTreeMap::from([(
            StatusCode::CREATED.as_str().to_owned(),
            RefOr::T(json_response("Created", &T::name())),
        )])
    }
}

/// `204 No Content`.
pub struct NoContent;

impl IntoResponse for NoContent {
    fn into_response(self) -> Response {
        StatusCode::NO_CONTENT.into_response()
    }
}

impl utoipa::IntoResponses for NoContent {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        BTreeMap::from([(
            StatusCode::NO_CONTENT.as_str().to_owned(),
            RefOr::T(ResponseBuilder::new().description("No Content").build()),
        )])
    }
}

/// A response built by hand, described by `D`. For the handlers that must
/// keep building their `Response` — the protocol endpoints, whose answers
/// carry headers and redirects in shapes of their own — so that they too
/// are described by their return type.
pub struct Documented<D>(Response, PhantomData<D>);

impl<D> From<Response> for Documented<D> {
    fn from(response: Response) -> Self {
        Self(response, PhantomData)
    }
}

impl<D> IntoResponse for Documented<D> {
    fn into_response(self) -> Response {
        self.0
    }
}

impl<D: utoipa::IntoResponses> utoipa::IntoResponses for Documented<D> {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        D::responses()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::http::header;

    /// What the tuples the handlers returned before produce.
    #[tokio::test]
    async fn created_is_a_201_with_the_json_body() {
        let response = Created(serde_json::json!({"id": 1})).into_response();

        assert_eq!(response.status(), StatusCode::CREATED);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&bytes[..], br#"{"id":1}"#);
    }

    #[tokio::test]
    async fn no_content_is_an_empty_204() {
        let response = NoContent.into_response();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert!(response.headers().get(header::CONTENT_TYPE).is_none());
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(bytes.is_empty());
    }

    /// One response per status; the codes listed once, sorted, in the
    /// extension and in the enum alike.
    #[test]
    fn error_responses_group_by_status() {
        let responses = error_responses(
            &[
                (StatusCode::NOT_FOUND, "b"),
                (StatusCode::BAD_REQUEST, "c"),
                (StatusCode::NOT_FOUND, "a"),
                (StatusCode::NOT_FOUND, "b"),
            ],
            ErrorShape::Api,
        );
        let document = serde_json::to_value(&responses).unwrap();

        assert_eq!(
            responses.keys().collect::<Vec<_>>(),
            ["400", "404"].iter().collect::<Vec<_>>()
        );
        let not_found = &document["404"];
        assert_eq!(
            not_found[ERROR_CODES_EXTENSION],
            serde_json::json!(["a", "b"])
        );
        assert_eq!(
            not_found["content"]["application/json"]["schema"]["properties"]["error"]["properties"]
                ["code"]["enum"],
            serde_json::json!(["a", "b"])
        );
    }
}
