//! The sign-in SPA on CAS's own origin, for a server given `CAS_SPA_DIR`
//! (ADR 0024 (b)). It mirrors what the Worker's assets do: a path that is a
//! file answers the file, and any other path answers `index.html` with 200,
//! while the prefixes CAS owns (`runWorkerFirst` in `cloudflare.config.ts`)
//! never answer the SPA. `/api`, `/health` and `/openapi.json` need no line
//! here, since each answers before the fallback this service is mounted as.

use std::convert::Infallible;
use std::path::Path;

use axum::{
    body::Body,
    http::{Request, StatusCode},
    response::{IntoResponse, Response},
};
use tower::{Service, ServiceExt as _, service_fn};
use tower_http::services::{ServeDir, ServeFile};

/// The name of the document every path that is not a file answers.
pub(super) const INDEX: &str = "index.html";

/// Paths under `/oidc` and `/.well-known` are protocol paths: an unknown one
/// is a 404, not a page.
const CAS_PREFIXES: [&str; 2] = ["/oidc", "/.well-known"];

fn is_cas_path(path: &str) -> bool {
    CAS_PREFIXES.iter().any(|prefix| {
        path.strip_prefix(prefix)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
    })
}

/// The fallback service over the built SPA in `dir`.
///
/// `append_index_html_on_directories` is off because its default answers a
/// directory path with a redirect to the slash-terminated path, which the
/// trailing-slash normalization in front of the router strips again, for
/// ever. With it off a directory is not a file, `/` included, and takes the
/// fallback. `fallback`, not `not_found_service`, so `index.html` answers
/// 200. `ServeDir` keeps its 405 for anything but `GET` and `HEAD`.
pub(super) fn service(
    dir: &Path,
) -> impl Service<Request<Body>, Response = Response, Error = Infallible, Future: Send + 'static>
+ Clone
+ Send
+ Sync
+ 'static {
    let files = ServeDir::new(dir)
        .append_index_html_on_directories(false)
        .fallback(ServeFile::new(dir.join(INDEX)));

    service_fn(move |request: Request<Body>| {
        let files = files.clone();
        async move {
            if is_cas_path(request.uri().path()) {
                return Ok(StatusCode::NOT_FOUND.into_response());
            }
            let response = files.oneshot(request).await?;
            Ok(response.into_response())
        }
    })
}

#[cfg(test)]
pub(super) use tests::Site;

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use axum::body::to_bytes;
    use axum::http::header;
    use uuid::Uuid;

    use super::*;

    const INDEX_HTML: &str = "<!doctype html><div id=\"root\"></div>";
    const APP_JS: &str = "console.log('app')";
    const SECRET: &str = "outside the directory";

    /// A built SPA under the system's temporary directory, removed on drop.
    pub(in crate::http) struct Site {
        root: PathBuf,
    }

    impl Site {
        pub(in crate::http) fn new() -> Self {
            let root = std::env::temp_dir().join(format!("cas-spa-{}", Uuid::new_v4()));
            fs::create_dir_all(root.join("dist/assets")).unwrap();
            fs::write(root.join("dist").join(INDEX), INDEX_HTML).unwrap();
            fs::write(root.join("dist/assets/app.js"), APP_JS).unwrap();
            fs::write(root.join("secret"), SECRET).unwrap();
            Self { root }
        }

        pub(in crate::http) fn dir(&self) -> PathBuf {
            self.root.join("dist")
        }
    }

    impl Drop for Site {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    async fn request(site: &Site, method: &str, uri: &str) -> Response {
        service(&site.dir())
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

    async fn body(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    #[tokio::test]
    async fn a_file_answers_itself() {
        let site = Site::new();

        let response = request(&site, "GET", "/assets/app.js").await;

        assert_eq!(response.status(), StatusCode::OK);
        let content_type = response.headers()[header::CONTENT_TYPE].to_str().unwrap();
        assert!(content_type.contains("javascript"), "{content_type}");
        assert_eq!(body(response).await, APP_JS);
    }

    #[tokio::test]
    async fn a_path_that_is_no_file_answers_the_document() {
        let site = Site::new();

        for uri in ["/", "/sign-in", "/assets/missing.js"] {
            let response = request(&site, "GET", uri).await;

            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert_eq!(body(response).await, INDEX_HTML, "{uri}");
        }
    }

    /// The default `ServeDir` redirects here, which the normalization in
    /// front of the router turns into a loop.
    #[tokio::test]
    async fn a_directory_answers_the_document_with_no_redirect() {
        let site = Site::new();

        for uri in ["/assets", "/assets/"] {
            let response = request(&site, "GET", uri).await;

            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert!(!response.headers().contains_key(header::LOCATION), "{uri}");
            assert_eq!(body(response).await, INDEX_HTML, "{uri}");
        }
    }

    #[tokio::test]
    async fn a_path_of_cas_never_answers_the_document() {
        let site = Site::new();

        for uri in ["/oidc", "/oidc/nope", "/.well-known", "/.well-known/nope"] {
            let response = request(&site, "GET", uri).await;

            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
            assert_eq!(body(response).await, "", "{uri}");
        }
    }

    /// Only the whole segment is CAS's.
    #[tokio::test]
    async fn a_path_that_only_starts_like_a_prefix_is_a_page() {
        let site = Site::new();

        let response = request(&site, "GET", "/oidc-help").await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(body(response).await, INDEX_HTML);
    }

    #[tokio::test]
    async fn only_reads_are_served() {
        let site = Site::new();

        let response = request(&site, "POST", "/sign-in").await;

        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    #[tokio::test]
    async fn nothing_outside_the_directory_is_served() {
        let site = Site::new();

        for uri in ["/../secret", "/%2e%2e/secret", "/assets/../../secret"] {
            let response = request(&site, "GET", uri).await;

            assert_ne!(body(response).await, SECRET, "{uri}");
        }
    }
}
