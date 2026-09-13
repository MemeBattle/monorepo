//! The CSRF line for `/api`: a mutating request must come from this site or
//! from an origin the frontend is served from. Decided in ADR 0005.
//!
//! The check reads the browser's Fetch Metadata (`Sec-Fetch-Site`) and falls
//! back to `Origin` for clients that send neither. It costs no state and no
//! token: the browser states where a request came from and the server says
//! whether that is good enough.

use std::sync::Arc;

use axum::{
    Router,
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, Method, header},
    middleware::{self, Next},
    response::Response,
};

use crate::http::error::ApiError;
use crate::http::extract::original_path;

const SEC_FETCH_SITE: &str = "sec-fetch-site";

/// The origins a cross-site mutating request may come from: the frontend in
/// development and any other site CORS already admits. Shared by every
/// request, hence the `Arc`.
#[derive(Debug, Clone)]
pub struct AllowedOrigins(Arc<[HeaderValue]>);

impl AllowedOrigins {
    pub fn new(origins: Vec<HeaderValue>) -> Self {
        Self(origins.into())
    }

    fn contains(&self, origin: &HeaderValue) -> bool {
        self.0.iter().any(|allowed| allowed == origin)
    }
}

/// Wraps every route of `router` in the check, and the fallback `router`
/// itself carries — a nested router without one of its own hands unmatched
/// paths back to the router it is mounted in, where this layer is no longer
/// in the way, so `/api` brings its own. The `/api` router goes through here
/// before it is mounted.
pub fn guard(router: Router, origins: AllowedOrigins) -> Router {
    router.layer(middleware::from_fn_with_state(origins, reject_cross_site))
}

async fn reject_cross_site(
    State(origins): State<AllowedOrigins>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    verdict(request.method(), request.headers(), &origins).map_err(|rejection| {
        tracing::warn!(
            method = %request.method(),
            path = original_path(request.extensions(), request.uri()),
            sec_fetch_site = ?request.headers().get(SEC_FETCH_SITE),
            origin = ?request.headers().get(header::ORIGIN),
            reason = rejection.reason(),
            "cross-site mutating request rejected"
        );
        ApiError::forbidden("cross_site_request", "Cross-site requests are not allowed")
    })?;

    Ok(next.run(request).await)
}

/// Why a request was turned away. Logged, never sent to the client: the
/// response is the same 403 whatever the reason.
#[derive(Debug, PartialEq, Eq)]
enum Rejection {
    /// `Sec-Fetch-Site` names another origin and `Origin` is not an allowed
    /// one.
    CrossSite,
    /// No Fetch Metadata, and an `Origin` that is not an allowed one.
    UnknownOrigin,
}

impl Rejection {
    fn reason(&self) -> &'static str {
        match self {
            Rejection::CrossSite => "cross_site",
            Rejection::UnknownOrigin => "unknown_origin",
        }
    }
}

/// The decision, as a pure function of the method and the headers.
///
/// Safe methods always pass: `GET` navigations from other sites are how the
/// future OIDC `/authorize` arrives, and a safe method changes nothing. For
/// the rest, `Sec-Fetch-Site` is the authority when present: `same-origin`
/// and `none` (a user-initiated request) pass; `same-site`, `cross-site`,
/// and any value this code does not know, pass only with an allowed
/// `Origin`. A sibling subdomain is same-site and still another party.
/// Without Fetch Metadata the request is an old browser or a non-browser
/// client, and `Origin` decides alone: absent or allowed passes.
fn verdict(
    method: &Method,
    headers: &HeaderMap,
    origins: &AllowedOrigins,
) -> Result<(), Rejection> {
    if matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return Ok(());
    }

    let origin_allowed = || {
        headers
            .get(header::ORIGIN)
            .is_some_and(|origin| origins.contains(origin))
    };

    match headers.get(SEC_FETCH_SITE).map(HeaderValue::as_bytes) {
        Some(b"same-origin" | b"none") => Ok(()),
        Some(_) if origin_allowed() => Ok(()),
        Some(_) => Err(Rejection::CrossSite),
        None if headers.get(header::ORIGIN).is_none() || origin_allowed() => Ok(()),
        None => Err(Rejection::UnknownOrigin),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode},
        routing::{get, post},
    };
    use tower::ServiceExt;

    use crate::testing::capture_tracing;

    const ALLOWED: &str = "http://localhost:5173";
    const OTHER: &str = "https://evil.example";

    fn origins() -> AllowedOrigins {
        AllowedOrigins::new(vec![HeaderValue::from_static(ALLOWED)])
    }

    fn app() -> Router {
        guard(
            Router::new()
                .route("/read", get(|| async { StatusCode::OK }))
                .route("/mutate", post(|| async { StatusCode::NO_CONTENT })),
            origins(),
        )
    }

    fn request(method: &str, path: &str, headers: &[(&str, &str)]) -> Request<Body> {
        let mut request = Request::builder().method(method).uri(path);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        request.body(Body::empty()).unwrap()
    }

    async fn status_of(headers: &[(&str, &str)]) -> StatusCode {
        app()
            .oneshot(request("POST", "/mutate", headers))
            .await
            .unwrap()
            .status()
    }

    #[test]
    fn same_origin_and_user_initiated_requests_pass_whatever_the_origin() {
        for site in ["same-origin", "none"] {
            for origin in [None, Some(ALLOWED), Some(OTHER)] {
                let mut headers = HeaderMap::new();
                headers.insert(SEC_FETCH_SITE, HeaderValue::from_static(site));
                if let Some(origin) = origin {
                    headers.insert(header::ORIGIN, HeaderValue::from_static(origin));
                }

                assert_eq!(
                    verdict(&Method::POST, &headers, &origins()),
                    Ok(()),
                    "{site} with origin {origin:?}"
                );
            }
        }
    }

    /// `same-site` is held to the same rule as `cross-site`: a sibling
    /// subdomain shares the cookie jar (`SameSite=Lax` does not stop it) but
    /// is not this service, so only the origin list admits it.
    #[test]
    fn same_site_and_cross_site_fetch_metadata_need_an_allowed_origin() {
        for site in ["same-site", "cross-site"] {
            let mut headers = HeaderMap::new();
            headers.insert(SEC_FETCH_SITE, HeaderValue::from_static(site));
            assert_eq!(
                verdict(&Method::POST, &headers, &origins()),
                Err(Rejection::CrossSite),
                "{site} without origin"
            );

            headers.insert(header::ORIGIN, HeaderValue::from_static(OTHER));
            assert_eq!(
                verdict(&Method::POST, &headers, &origins()),
                Err(Rejection::CrossSite),
                "{site} with a foreign origin"
            );

            headers.insert(header::ORIGIN, HeaderValue::from_static(ALLOWED));
            assert_eq!(
                verdict(&Method::POST, &headers, &origins()),
                Ok(()),
                "{site} with an allowed origin"
            );
        }
    }

    /// A `Sec-Fetch-Site` value this code has never heard of is treated like
    /// `cross-site`: the safe reading of an unknown claim.
    #[test]
    fn an_unknown_fetch_site_value_is_treated_as_cross_site() {
        let mut headers = HeaderMap::new();
        headers.insert(SEC_FETCH_SITE, HeaderValue::from_static("other-planet"));
        assert_eq!(
            verdict(&Method::POST, &headers, &origins()),
            Err(Rejection::CrossSite)
        );

        headers.insert(header::ORIGIN, HeaderValue::from_static(ALLOWED));
        assert_eq!(verdict(&Method::POST, &headers, &origins()), Ok(()));
    }

    #[test]
    fn without_fetch_metadata_the_origin_decides() {
        let mut headers = HeaderMap::new();
        assert_eq!(verdict(&Method::POST, &headers, &origins()), Ok(()));

        headers.insert(header::ORIGIN, HeaderValue::from_static(ALLOWED));
        assert_eq!(verdict(&Method::POST, &headers, &origins()), Ok(()));

        headers.insert(header::ORIGIN, HeaderValue::from_static(OTHER));
        assert_eq!(
            verdict(&Method::POST, &headers, &origins()),
            Err(Rejection::UnknownOrigin)
        );

        // An opaque origin (sandboxed frame, redirect across origins, some
        // privacy modes) is not an allowed one.
        headers.insert(header::ORIGIN, HeaderValue::from_static("null"));
        assert_eq!(
            verdict(&Method::POST, &headers, &origins()),
            Err(Rejection::UnknownOrigin)
        );
    }

    #[test]
    fn safe_methods_pass_from_anywhere() {
        let mut headers = HeaderMap::new();
        headers.insert(SEC_FETCH_SITE, HeaderValue::from_static("cross-site"));
        headers.insert(header::ORIGIN, HeaderValue::from_static(OTHER));

        for method in [Method::GET, Method::HEAD, Method::OPTIONS] {
            assert_eq!(verdict(&method, &headers, &origins()), Ok(()), "{method}");
        }
        for method in [Method::POST, Method::PUT, Method::PATCH, Method::DELETE] {
            assert_eq!(
                verdict(&method, &headers, &origins()),
                Err(Rejection::CrossSite),
                "{method}"
            );
        }
    }

    #[test]
    fn origin_comparison_is_exact() {
        let origins = origins();
        for origin in [
            "http://localhost:5173/",
            "HTTP://localhost:5173",
            "http://localhost:5173.evil.example",
            "https://localhost:5173",
        ] {
            assert!(
                !origins.contains(&HeaderValue::from_static(origin)),
                "{origin} must not match {ALLOWED}"
            );
        }
    }

    /// A cross-site HTML form: `Sec-Fetch-Site: cross-site`, an `Origin` of
    /// the attacking page, and the cookie that `SameSite=Lax` would have
    /// withheld anyway. The layer answers before the handler runs.
    #[tokio::test]
    async fn a_cross_site_form_post_is_forbidden_with_the_standard_error_shape() {
        let response = app()
            .oneshot(request(
                "POST",
                "/mutate",
                &[
                    (SEC_FETCH_SITE, "cross-site"),
                    ("sec-fetch-mode", "navigate"),
                    ("origin", OTHER),
                    ("content-type", "application/x-www-form-urlencoded"),
                ],
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["error"]["code"], "cross_site_request");
    }

    /// `fetch` from the frontend with its `Origin`. In development the API
    /// is on another port of the same host, which browsers report as
    /// `same-site`; a frontend on a sibling subdomain in production is
    /// `same-site` too, and one on another domain is `cross-site`. The
    /// origin list admits all three.
    #[tokio::test]
    async fn a_fetch_from_the_frontend_passes() {
        for site in ["same-site", "cross-site"] {
            assert_eq!(
                status_of(&[(SEC_FETCH_SITE, site), ("origin", ALLOWED)]).await,
                StatusCode::NO_CONTENT,
                "{site}"
            );
        }
    }

    /// A form on a sibling subdomain: the browser sends `same-site` and the
    /// session cookie, and the sibling is not in the origin list.
    #[tokio::test]
    async fn a_same_site_form_post_from_a_sibling_subdomain_is_forbidden() {
        assert_eq!(
            status_of(&[
                (SEC_FETCH_SITE, "same-site"),
                ("sec-fetch-mode", "navigate"),
                ("origin", "https://blog.example.test"),
                ("content-type", "application/x-www-form-urlencoded"),
            ])
            .await,
            StatusCode::FORBIDDEN
        );
    }

    /// curl, a server-side client, a browser from before Fetch Metadata.
    #[tokio::test]
    async fn a_request_without_fetch_metadata_or_origin_passes() {
        assert_eq!(status_of(&[]).await, StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn a_get_from_anywhere_is_untouched() {
        let response = app()
            .oneshot(request(
                "GET",
                "/read",
                &[(SEC_FETCH_SITE, "cross-site"), ("origin", OTHER)],
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    /// The layer covers the router's fallback as well as its routes, so a
    /// cross-site probe of an unknown path is told nothing but 403. This
    /// holds for the router handed to `guard`; that the mounted `/api` router
    /// has a fallback of its own to be covered here is what
    /// `crate::http::tests::a_cross_site_probe_of_an_unknown_api_path_is_forbidden`
    /// checks, through the real composition.
    /// The refusal is logged with the path the client sent. The layer sits
    /// on a nested router, which strips its prefix before the layer runs, so
    /// the plain URI would say `/mutate` for a request to `/api/mutate`.
    #[tokio::test]
    async fn the_refusal_names_the_path_the_client_sent() {
        let (events, _guard) = capture_tracing();
        let nested = Router::new().nest("/api", app());

        let response = nested
            .oneshot(request(
                "POST",
                "/api/mutate",
                &[(SEC_FETCH_SITE, "cross-site"), ("origin", OTHER)],
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let [warning] = &events.mentioning("cross-site mutating request rejected")[..] else {
            panic!("exactly one warning: {:?}", events.all());
        };
        assert!(warning.starts_with("WARN"), "{warning}");
        assert!(warning.contains("path=\"/api/mutate\""), "{warning}");
    }

    #[tokio::test]
    async fn the_fallback_is_guarded_too() {
        let response = app()
            .oneshot(request(
                "POST",
                "/nowhere",
                &[(SEC_FETCH_SITE, "cross-site"), ("origin", OTHER)],
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
