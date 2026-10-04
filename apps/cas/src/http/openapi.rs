//! The OpenAPI description of the whole service, assembled from the
//! contexts' routers: every route is mounted through `utoipa_axum::routes!`,
//! so the document lists exactly what the router serves, and every
//! operation's responses come from its handler's return type. Served at
//! `GET /openapi.json` and committed as `apps/cas/openapi.json`, which a
//! test keeps current. See `docs/adr/0016-openapi-description.md`.
//!
//! What no handler can say for itself is added here: the 500 every route
//! can answer when something nobody anticipated happens (the panic catcher
//! and [`ApiError::internal`](crate::http::error::ApiError::internal) are
//! behind every one of them), and the security schemes.

use std::collections::BTreeMap;
use std::sync::Arc;

use axum::{
    Router,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::Value;
use utoipa::openapi::{
    Components, ContentBuilder, InfoBuilder, ObjectBuilder, OneOfBuilder, OpenApi, OpenApiBuilder,
    RefOr, ResponseBuilder, Schema, Type,
    path::{Operation, PathItem},
    response::Response as OpenApiResponse,
    security::{ApiKey, ApiKeyValue, HttpAuthScheme, HttpBuilder, SecurityScheme},
};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::http::error::INTERNAL_ERROR;
use crate::http::response::{
    ERROR_CODES_EXTENSION, ErrorShape, api_error_schema, error_codes, error_response,
};

/// The document the contexts' descriptions are merged into: what the
/// service is, and how its endpoints authenticate.
pub(crate) fn base() -> OpenApi {
    let mut components = Components::new();
    let mut session = ApiKeyValue::new("cas_session");
    session.description = Some(
        "The session cookie set by registration and login (ADR 0004). On an https origin \
         its name is `__Host-cas_session`."
            .to_owned(),
    );
    components.add_security_scheme("session", SecurityScheme::ApiKey(ApiKey::Cookie(session)));
    components.add_security_scheme(
        "bearer",
        SecurityScheme::Http(
            HttpBuilder::new()
                .scheme(HttpAuthScheme::Bearer)
                .bearer_format("JWT")
                .description(Some("An access token `/oidc/token` issued (ADR 0011)."))
                .build(),
        ),
    );
    components.add_security_scheme(
        "basic",
        SecurityScheme::Http(
            HttpBuilder::new()
                .scheme(HttpAuthScheme::Basic)
                .description(Some(
                    "`client_secret_basic`: a confidential client's id and secret.",
                ))
                .build(),
        ),
    );

    OpenApiBuilder::new()
        .info(
            InfoBuilder::new()
                .title("CAS")
                .version(env!("CARGO_PKG_VERSION"))
                .description(Some(
                    "The passkey identity provider of MemeBattle: the JSON API under `/api` \
                     for its own frontend, and the OpenID Connect endpoints under `/oidc`. \
                     Every error response lists the stable codes it can carry in \
                     `x-error-codes`; clients branch on those codes, never on messages.",
                )),
        )
        .components(Some(components))
        .build()
}

/// Mounts `GET /openapi.json` on `router` and completes `document` with it
/// and with the fallback 500. Returns both: the router serving the
/// document, and the document it serves.
pub(crate) fn serve_document(router: Router, mut document: OpenApi) -> (Router, OpenApi) {
    let (route, own) = OpenApiRouter::<Arc<str>>::new()
        .routes(routes!(openapi_json))
        .split_for_parts();
    document.merge(own);
    describe_fallback(&mut document);
    let json: Arc<str> = format!(
        "{}\n",
        document
            .to_pretty_json()
            .expect("the description is plain data and always serializes")
    )
    .into();
    (router.merge(route.with_state(json)), document)
}

/// The document, as JSON.
struct OpenApiJson(Arc<str>);

impl IntoResponse for OpenApiJson {
    fn into_response(self) -> Response {
        (
            [(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            )],
            self.0.to_string(),
        )
            .into_response()
    }
}

impl utoipa::IntoResponses for OpenApiJson {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        BTreeMap::from([(
            StatusCode::OK.as_str().to_owned(),
            RefOr::T(
                ResponseBuilder::new()
                    .description("This document (OpenAPI 3.1).")
                    .content(
                        "application/json",
                        ContentBuilder::new()
                            .schema(Some(ObjectBuilder::new().schema_type(Type::Object)))
                            .build(),
                    )
                    .build(),
            ),
        )])
    }
}

/// The OpenAPI description of the service. Public: it says nothing the
/// discovery document and the code do not.
#[utoipa::path(get, path = "/openapi.json")]
async fn openapi_json(State(document): State<Arc<str>>) -> OpenApiJson {
    OpenApiJson(document)
}

/// Every operation of the document with its method, lowercase.
pub(crate) fn operations_mut(document: &mut OpenApi) -> Vec<(&'static str, &mut Operation)> {
    document
        .paths
        .paths
        .values_mut()
        .flat_map(operations_of)
        .collect()
}

fn operations_of(item: &mut PathItem) -> Vec<(&'static str, &mut Operation)> {
    let PathItem {
        get,
        put,
        post,
        delete,
        options,
        head,
        patch,
        trace,
        query,
        ..
    } = item;
    [
        ("get", get),
        ("put", put),
        ("post", post),
        ("delete", delete),
        ("options", options),
        ("head", head),
        ("patch", patch),
        ("trace", trace),
        ("query", query),
    ]
    .into_iter()
    .filter_map(|(method, operation)| operation.as_mut().map(|operation| (method, operation)))
    .collect()
}

/// The codes an error response of the description lists.
fn listed_codes(response: &OpenApiResponse) -> Vec<String> {
    response
        .extensions
        .as_ref()
        .and_then(|extensions| extensions.get(ERROR_CODES_EXTENSION))
        .and_then(Value::as_array)
        .map(|codes| {
            codes
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

/// Adds `code` at `status` in the `ApiError` shape to `operation`, merging
/// it with the codes the operation already lists there. For a layer that
/// answers on the handlers' behalf, such as the CSRF line under `/api`.
pub(crate) fn add_api_error(operation: &mut Operation, status: StatusCode, code: &'static str) {
    let responses = &mut operation.responses.responses;
    let mut codes = vec![code.to_owned()];
    if let Some(RefOr::T(existing)) = responses.get(status.as_str()) {
        codes.extend(listed_codes(existing));
    }
    codes.sort_unstable();
    codes.dedup();
    let codes: Vec<&str> = codes.iter().map(String::as_str).collect();
    responses.insert(
        status.as_str().to_owned(),
        RefOr::T(error_response(&codes, ErrorShape::Api)),
    );
}

/// The fallback 500 on every operation: `internal_error` in the `ApiError`
/// shape, which the panic catcher and `ApiError::internal` answer with.
/// Where a protocol endpoint describes a 500 of its own (`server_error` for
/// `/oidc/token` and `/oidc/userinfo`, the `internal` page for `/oidc/authorize` and
/// `/oidc/end_session`), the two become one response that lists both codes and
/// describes both bodies: a `oneOf` of the two JSON shapes, or the page and
/// the JSON side by side. No handler declares the fallback itself.
pub(crate) fn describe_fallback(document: &mut OpenApi) {
    let status = StatusCode::INTERNAL_SERVER_ERROR.as_str();
    for (_, operation) in operations_mut(document) {
        let responses = &mut operation.responses.responses;
        let merged = match responses.remove(status) {
            Some(RefOr::T(own)) => merge_with_fallback(own),
            _ => error_response(&[INTERNAL_ERROR], ErrorShape::Api),
        };
        responses.insert(status.to_owned(), RefOr::T(merged));
    }
}

fn merge_with_fallback(mut own: OpenApiResponse) -> OpenApiResponse {
    let mut codes = listed_codes(&own);
    codes.push(INTERNAL_ERROR.to_owned());
    codes.sort_unstable();
    codes.dedup();

    let fallback: RefOr<Schema> = api_error_schema(&[INTERNAL_ERROR]).into();
    let json = match own.content.shift_remove("application/json") {
        Some(RefOr::T(content)) => match content.schema {
            Some(schema) => OneOfBuilder::new().item(schema).item(fallback).into(),
            None => fallback,
        },
        _ => fallback,
    };
    own.content.insert(
        "application/json".to_owned(),
        RefOr::T(ContentBuilder::new().schema(Some(json)).build()),
    );
    own.description = codes.join(", ");
    let codes: Vec<&str> = codes.iter().map(String::as_str).collect();
    own.extensions = Some(error_codes(&codes));
    own
}

/// Test-only: the conformance check, a layer that compares every response
/// a router gives with what the description says it may give.
#[cfg(test)]
pub(crate) mod conformance {
    use std::sync::Arc;

    use axum::{
        Router,
        extract::{Request, State},
        http::{Method, StatusCode},
        middleware::{self, Next},
        response::Response,
    };
    use serde_json::Value;
    use utoipa::openapi::OpenApi;

    use crate::http::error::ErrorCode;
    use crate::http::fetch_metadata::CROSS_SITE_REQUEST;
    use crate::http::response::ERROR_CODES_EXTENSION;

    /// Wraps every route and the fallback of `router` in the check against
    /// `document`, which must already describe the fallback 500. For each
    /// response it finds the operation by method and path template — a
    /// `HEAD` without an operation of its own by `GET`'s, an `OPTIONS` is
    /// not checked — and panics when the status is not declared, or when
    /// the response carries an [`ErrorCode`] that the status does not list.
    /// A request the document has no operation for may only be answered
    /// 404 or 405, or 403 `cross_site_request` (the CSRF line guards the
    /// `/api` fallback too): a route mounted without `routes!` cannot stay
    /// undocumented once a test touches it.
    pub(crate) fn check(router: Router, document: &OpenApi) -> Router {
        let document =
            Arc::new(serde_json::to_value(document).expect("the description serializes"));
        router.layer(middleware::from_fn_with_state(document, conform))
    }

    async fn conform(State(document): State<Arc<Value>>, request: Request, next: Next) -> Response {
        let method = request.method().clone();
        let path = request.uri().path().to_owned();
        let response = next.run(request).await;
        verify(&document, &method, &path, &response);
        response
    }

    fn verify(document: &Value, method: &Method, path: &str, response: &Response) {
        if method == Method::OPTIONS {
            return;
        }
        let status = response.status();
        let code = response.extensions().get::<ErrorCode>().map(|code| code.0);

        let Some(operation) = operation(document, method, path) else {
            let tolerated = matches!(
                status,
                StatusCode::NOT_FOUND | StatusCode::METHOD_NOT_ALLOWED
            ) || (status == StatusCode::FORBIDDEN
                && code == Some(CROSS_SITE_REQUEST));
            assert!(
                tolerated,
                "{method} {path} is not in the description, yet answered {status} {code:?}"
            );
            return;
        };

        let Some(declared) = operation["responses"].get(status.as_str()) else {
            panic!(
                "{method} {path} answered {status} {code:?}, which its description does not declare"
            );
        };
        if let Some(code) = code {
            let listed = declared[ERROR_CODES_EXTENSION]
                .as_array()
                .is_some_and(|codes| codes.iter().any(|listed| listed == code));
            assert!(
                listed,
                "{method} {path} answered {status} with the code {code}, which its description \
                 does not list there"
            );
        }
    }

    /// The operation for `method` on the path template that matches
    /// `path`, the one with the most literal segments if several do, as the
    /// router itself prefers a static segment to a parameter.
    pub(crate) fn operation<'d>(
        document: &'d Value,
        method: &Method,
        path: &str,
    ) -> Option<&'d Value> {
        let segments: Vec<&str> = path.split('/').collect();
        let (_, item) = document["paths"]
            .as_object()?
            .iter()
            .filter_map(|(template, item)| {
                let parts: Vec<&str> = template.split('/').collect();
                let matches = parts.len() == segments.len()
                    && parts.iter().zip(&segments).all(|(part, segment)| {
                        part == segment || (part.starts_with('{') && !segment.is_empty())
                    });
                matches.then(|| {
                    let literal = parts.iter().filter(|part| !part.starts_with('{')).count();
                    (literal, item)
                })
            })
            .max_by_key(|(literal, _)| *literal)?;

        let name = method.as_str().to_ascii_lowercase();
        item.get(&name)
            .or_else(|| (method == Method::HEAD).then(|| item.get("get")).flatten())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeSet, HashMap};

    use axum::{
        body::{Body, to_bytes},
        http::{Method, Request, header},
        routing::get,
    };
    use serde_json::json;
    use sqlx::PgPool;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::http::error::ApiError;
    use crate::http::fetch_metadata::{AllowedOrigins, CROSS_SITE_REQUEST};
    use crate::http::response::oauth_error_schema;
    use crate::http::{api_router, app};
    use crate::testing::{
        checked, signed_in, test_config, test_state, unreachable_database_config,
    };

    async fn get_document() -> (Response, Value) {
        let response = app(test_config())
            .unwrap()
            .oneshot(
                Request::builder()
                    .uri("/openapi.json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let (parts, body) = response.into_parts();
        let bytes = to_bytes(body, usize::MAX).await.unwrap();
        let document = serde_json::from_slice(&bytes).unwrap();
        (Response::from_parts(parts, Body::from(bytes)), document)
    }

    async fn document() -> Value {
        get_document().await.1
    }

    /// The committed `openapi.json` is what the code describes. When the
    /// API changes, regenerate it with
    /// `UPDATE_OPENAPI=1 cargo test --lib the_committed_document_is_current`
    /// and commit the result.
    #[tokio::test]
    async fn the_committed_document_is_current() {
        let (response, document) = get_document().await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        assert_eq!(document["openapi"], "3.1.0");
        let served = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let served = std::str::from_utf8(&served).unwrap();

        let committed = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("openapi.json");
        if std::env::var_os("UPDATE_OPENAPI").is_some() {
            std::fs::write(&committed, served).unwrap();
            return;
        }
        let on_disk = std::fs::read_to_string(&committed).unwrap_or_default();
        assert!(
            on_disk == served,
            "apps/cas/openapi.json is out of date: run \
             `UPDATE_OPENAPI=1 cargo test --lib the_committed_document_is_current` in apps/cas \
             and commit the file"
        );
    }

    fn references(value: &Value, found: &mut BTreeSet<String>) {
        match value {
            Value::Object(object) => {
                if let Some(Value::String(reference)) = object.get("$ref") {
                    found.insert(reference.clone());
                }
                object.values().for_each(|value| references(value, found));
            }
            Value::Array(values) => values.iter().for_each(|value| references(value, found)),
            _ => {}
        }
    }

    #[tokio::test]
    async fn every_reference_resolves() {
        let document = document().await;
        let mut found = BTreeSet::new();
        references(&document, &mut found);

        assert!(!found.is_empty());
        for reference in found {
            let name = reference
                .strip_prefix("#/components/schemas/")
                .unwrap_or_else(|| panic!("an unexpected reference {reference}"));
            assert!(
                document["components"]["schemas"].get(name).is_some(),
                "{reference} does not resolve"
            );
        }
    }

    /// Every (path, method) pair, with its operation.
    fn operations(document: &Value) -> Vec<(String, Method, Value)> {
        let mut operations = Vec::new();
        for (path, item) in document["paths"].as_object().unwrap() {
            for (method, operation) in item.as_object().unwrap() {
                let method = Method::from_bytes(method.to_ascii_uppercase().as_bytes()).unwrap();
                operations.push((path.clone(), method, operation.clone()));
            }
        }
        operations
    }

    #[tokio::test]
    async fn operation_ids_are_unique() {
        let document = document().await;
        let mut seen = HashMap::new();

        for (path, method, operation) in operations(&document) {
            let id = operation["operationId"]
                .as_str()
                .unwrap_or_else(|| panic!("{method} {path} has no operationId"))
                .to_owned();
            if let Some(other) = seen.insert(id.clone(), format!("{method} {path}")) {
                panic!("{id} names both {other} and {method} {path}");
            }
        }
    }

    /// The routes the router mounts, each with the methods it serves; the
    /// acceptance criterion of #752 is that the document lists them all.
    #[tokio::test]
    async fn every_mounted_route_is_described() {
        let document = document().await;
        let described: BTreeSet<(String, Method)> = operations(&document)
            .into_iter()
            .map(|(path, method, _)| (path, method))
            .collect();

        let mounted = [
            ("/health", Method::GET),
            ("/openapi.json", Method::GET),
            ("/.well-known/openid-configuration", Method::GET),
            ("/oidc/jwks.json", Method::GET),
            ("/oidc/authorize", Method::GET),
            ("/oidc/authorize", Method::HEAD),
            ("/oidc/token", Method::POST),
            ("/oidc/userinfo", Method::GET),
            ("/oidc/userinfo", Method::POST),
            ("/oidc/end_session", Method::GET),
            ("/oidc/end_session", Method::POST),
            ("/oidc/end_session", Method::HEAD),
            ("/api/me", Method::GET),
            ("/api/me", Method::PATCH),
            ("/api/logout", Method::POST),
            ("/api/webauthn/register-options", Method::POST),
            ("/api/webauthn/verify-registration", Method::POST),
            ("/api/webauthn/login-options", Method::POST),
            ("/api/webauthn/verify-login", Method::POST),
            ("/api/passkeys", Method::GET),
            ("/api/passkeys/register-options", Method::POST),
            ("/api/passkeys/verify-registration", Method::POST),
            ("/api/passkeys/{id}", Method::PATCH),
            ("/api/passkeys/{id}", Method::DELETE),
        ]
        .into_iter()
        .map(|(path, method)| (path.to_owned(), method))
        .collect();

        assert_eq!(described, mounted);
    }

    fn response_codes(response: &Value) -> Vec<String> {
        response[ERROR_CODES_EXTENSION]
            .as_array()
            .map(|codes| {
                codes
                    .iter()
                    .map(|code| code.as_str().unwrap().to_owned())
                    .collect()
            })
            .unwrap_or_default()
    }

    fn api_error_schema_for(codes: &[&str]) -> Value {
        serde_json::to_value(api_error_schema(codes).build()).unwrap()
    }

    #[tokio::test]
    async fn every_operation_describes_the_fallback_500() {
        let document = document().await;
        let fallback = api_error_schema_for(&[INTERNAL_ERROR]);
        let oauth =
            |codes: &[&str]| serde_json::to_value(oauth_error_schema(codes).build()).unwrap();

        for (path, method, operation) in operations(&document) {
            let response = &operation["responses"]["500"];
            let json_schema = &response["content"]["application/json"]["schema"];
            let codes = response_codes(response);
            match path.as_str() {
                "/oidc/token" | "/oidc/userinfo" => {
                    assert_eq!(codes, ["internal_error", "server_error"], "{method} {path}");
                    assert_eq!(
                        json_schema,
                        &json!({"oneOf": [oauth(&["server_error"]), fallback]}),
                        "{method} {path}"
                    );
                }
                "/oidc/authorize" | "/oidc/end_session" if method != Method::HEAD => {
                    assert_eq!(codes, ["internal", "internal_error"], "{method} {path}");
                    assert_eq!(json_schema, &fallback, "{method} {path}");
                    assert_eq!(
                        response["content"]["text/html"]["schema"],
                        json!({"type": "string"}),
                        "{method} {path}"
                    );
                }
                _ => {
                    assert_eq!(codes, [INTERNAL_ERROR], "{method} {path}");
                    assert_eq!(json_schema, &fallback, "{method} {path}");
                    assert_eq!(
                        response["content"].as_object().unwrap().len(),
                        1,
                        "{method} {path}"
                    );
                }
            }
        }
    }

    /// Under `/api` every error response is an `ApiError`: its codes are
    /// listed, and the same ones are the enum of `error.code`.
    #[tokio::test]
    async fn api_error_responses_list_their_codes() {
        let document = document().await;

        for (path, method, operation) in operations(&document) {
            if !path.starts_with("/api/") {
                continue;
            }
            for (status, response) in operation["responses"].as_object().unwrap() {
                if !(status.starts_with('4') || status.starts_with('5')) {
                    continue;
                }
                let codes = response_codes(response);
                assert!(!codes.is_empty(), "{method} {path} {status}");
                let codes: Vec<&str> = codes.iter().map(String::as_str).collect();
                assert_eq!(
                    response["content"]["application/json"]["schema"],
                    api_error_schema_for(&codes),
                    "{method} {path} {status}"
                );
            }
        }
    }

    /// An operation that requires a session declares the 401 its extractor
    /// answers.
    #[tokio::test]
    async fn an_operation_requiring_a_session_lists_unauthenticated() {
        let document = document().await;

        for (path, method, operation) in operations(&document) {
            if requires_session(&operation) {
                assert!(
                    response_codes(&operation["responses"]["401"])
                        .contains(&"unauthenticated".to_owned()),
                    "{method} {path}"
                );
            }
        }
    }

    fn requires_session(operation: &Value) -> bool {
        operation["security"]
            .as_array()
            .is_some_and(|requirements| {
                requirements
                    .iter()
                    .any(|requirement| requirement.get("session").is_some())
            })
    }

    /// The request for `method` on `path`, every parameter filled with
    /// `value`.
    fn uri(path: &str, value: &str) -> String {
        path.split('/')
            .map(|segment| {
                if segment.starts_with('{') {
                    value
                } else {
                    segment
                }
            })
            .collect::<Vec<_>>()
            .join("/")
    }

    fn is_unsafe(method: &Method) -> bool {
        !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
    }

    async fn body_json(response: Response) -> Option<Value> {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).ok()
    }

    /// Every operation, anonymous, answers as described and as expected: a
    /// request with no cookie and no body, one with a body that is not
    /// JSON, and, for an unsafe method under `/api`, one from another site.
    /// The database is unreachable, so nothing is written anywhere and a
    /// path that reaches it answers 503. The conformance layer of `app`
    /// checks every answer against the description; on top of that, a 401
    /// `unauthenticated` is exactly the answer of the operations requiring
    /// a session, the cross-site request is the CSRF line's 403, and nothing
    /// is a 500.
    #[tokio::test]
    async fn every_operation_answers_as_declared_when_anonymous() {
        let app = app(unreachable_database_config()).unwrap();
        let document = document().await;
        let id = Uuid::new_v4().to_string();

        for (path, method, operation) in operations(&document) {
            let uri = uri(&path, &id);
            let plain = Request::builder()
                .method(method.clone())
                .uri(&uri)
                .body(Body::empty())
                .unwrap();
            let not_json = Request::builder()
                .method(method.clone())
                .uri(&uri)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from("not json"))
                .unwrap();

            for (case, request) in [("plain", plain), ("not json", not_json)] {
                let response = app.clone().oneshot(request).await.unwrap();
                let status = response.status();
                assert_ne!(
                    status,
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "{method} {path} ({case})"
                );
                let unauthenticated = status == StatusCode::UNAUTHORIZED
                    && body_json(response)
                        .await
                        .is_some_and(|body| body["error"]["code"] == "unauthenticated");
                assert_eq!(
                    unauthenticated,
                    requires_session(&operation),
                    "{method} {path} ({case}): 401 unauthenticated exactly when the operation \
                     requires a session"
                );
            }

            if path.starts_with("/api/") && is_unsafe(&method) {
                let response = app
                    .clone()
                    .oneshot(
                        Request::builder()
                            .method(method.clone())
                            .uri(&uri)
                            .header("sec-fetch-site", "cross-site")
                            .header(header::ORIGIN, "https://evil.example")
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(response.status(), StatusCode::FORBIDDEN, "{method} {path}");
                assert_eq!(
                    body_json(response).await.unwrap()["error"]["code"],
                    "cross_site_request",
                    "{method} {path}"
                );
            }
        }
    }

    async fn expect_error(router: &Router, request: Request<Body>, status: StatusCode, code: &str) {
        let label = format!("{} {}", request.method(), request.uri());
        let response = router.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), status, "{label}");
        assert_eq!(
            body_json(response).await.unwrap()["error"]["code"],
            code,
            "{label}"
        );
    }

    /// Behind `Authenticated` the extractors of the path and the body are
    /// reached only by a signed-in request. Each case runs under a session
    /// of its own (logout revokes the one it is given): a path parameter
    /// that is not a uuid is 400 `invalid_path`; a body that is not JSON,
    /// one of the wrong shape and one without a content type are
    /// `invalid_body` at 400, 422 and 415. Cases come from the document:
    /// an operation without the extractor gets none.
    #[sqlx::test]
    async fn every_api_operation_rejects_bad_input_as_declared_when_signed_in(pool: PgPool) {
        let api = api_router(test_state(pool.clone()), AllowedOrigins::new(vec![]));
        let document = serde_json::to_value(api.get_openapi()).unwrap();
        let router = checked(api);
        let id = Uuid::new_v4().to_string();
        let mut cases = 0;

        for (path, method, operation) in operations(&document) {
            let has_parameter = path.contains('{');
            if has_parameter {
                let cookie = signed_in(&pool, "Ada").await.cookie;
                let mut request = Request::builder()
                    .method(method.clone())
                    .uri(uri(&path, "not-a-uuid"))
                    .header(header::COOKIE, cookie);
                if operation.get("requestBody").is_some() {
                    request = request.header(header::CONTENT_TYPE, "application/json");
                }
                let request = request.body(Body::from("{}")).unwrap();
                expect_error(&router, request, StatusCode::BAD_REQUEST, "invalid_path").await;
                cases += 1;
            }

            if operation.get("requestBody").is_none() {
                continue;
            }
            for (content_type, body, status) in [
                (
                    Some("application/json"),
                    "not json",
                    StatusCode::BAD_REQUEST,
                ),
                (
                    Some("application/json"),
                    "[]",
                    StatusCode::UNPROCESSABLE_ENTITY,
                ),
                (None, "{}", StatusCode::UNSUPPORTED_MEDIA_TYPE),
            ] {
                let cookie = signed_in(&pool, "Ada").await.cookie;
                let mut request = Request::builder()
                    .method(method.clone())
                    .uri(uri(&path, &id))
                    .header(header::COOKIE, cookie);
                if let Some(content_type) = content_type {
                    request = request.header(header::CONTENT_TYPE, content_type);
                }
                let request = request.body(Body::from(body)).unwrap();
                expect_error(&router, request, status, "invalid_body").await;
                cases += 1;
            }
        }

        // Two path-parameter cases and six bodies times three.
        assert_eq!(cases, 2 + 6 * 3);
    }

    async fn declared() -> &'static str {
        "declared"
    }

    #[utoipa::path(get, path = "/declared")]
    async fn declared_route() -> crate::http::response::NoContent {
        crate::http::response::NoContent
    }

    async fn teapot() -> StatusCode {
        StatusCode::IM_A_TEAPOT
    }

    async fn coded() -> ApiError {
        ApiError::not_found("not_declared_here", "Not found")
    }

    /// A toy router: one documented route that answers 204, and whatever
    /// the test mounts undocumented next to it.
    fn toy(extra: Router) -> Router {
        let (router, mut document) = OpenApiRouter::new()
            .routes(routes!(declared_route))
            .split_for_parts();
        describe_fallback(&mut document);
        conformance::check(router.merge(extra), &document)
    }

    async fn send(router: Router, method: Method, uri: &str) -> Response {
        router
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn a_declared_answer_passes_the_check() {
        let response = send(toy(Router::new()), Method::GET, "/declared").await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    #[should_panic(expected = "does not declare")]
    async fn an_undeclared_status_fails_the_check() {
        let (router, mut document) = OpenApiRouter::new()
            .routes(routes!(declared_route))
            .split_for_parts();
        describe_fallback(&mut document);
        let router = conformance::check(
            router.layer(axum::middleware::map_response(|_: Response| async {
                teapot().await.into_response()
            })),
            &document,
        );
        send(router, Method::GET, "/declared").await;
    }

    #[tokio::test]
    #[should_panic(expected = "does not list")]
    async fn an_undeclared_code_fails_the_check() {
        let (router, mut document) = OpenApiRouter::new()
            .routes(routes!(declared_route))
            .split_for_parts();
        describe_fallback(&mut document);
        let response = crate::http::response::error_responses(
            &[(StatusCode::NOT_FOUND, "declared_here")],
            ErrorShape::Api,
        );
        for (_, operation) in operations_mut(&mut document) {
            operation.responses.responses.extend(response.clone());
        }
        let router = conformance::check(
            router.layer(axum::middleware::map_response(|_: Response| async {
                coded().await.into_response()
            })),
            &document,
        );
        send(router, Method::GET, "/declared").await;
    }

    #[tokio::test]
    #[should_panic(expected = "is not in the description")]
    async fn an_undocumented_route_fails_the_check() {
        let router = toy(Router::new().route("/undocumented", get(declared)));
        send(router, Method::GET, "/undocumented").await;
    }

    /// What the router answers for a request nobody routes: its 404 and
    /// 405, and the CSRF line's 403 in front of the `/api` fallback.
    #[tokio::test]
    async fn an_unknown_request_may_be_404_405_or_the_csrf_403() {
        let response = send(toy(Router::new()), Method::GET, "/nowhere").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = send(toy(Router::new()), Method::POST, "/declared").await;
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);

        let forbidden = Router::new().fallback(|| async {
            ApiError::forbidden(CROSS_SITE_REQUEST, "Cross-site requests are not allowed")
        });
        let response = send(toy(forbidden), Method::POST, "/nowhere").await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
