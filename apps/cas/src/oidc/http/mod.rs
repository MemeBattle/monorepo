//! The OIDC context's wire surface: the two static documents, served from
//! the router root outside `/api` (ADR 0009 (e)).

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, header},
    routing::get,
};
use tower_http::set_header::SetResponseHeaderLayer;

use crate::oidc::{Discovery, Jwks};

/// Both documents, built once at startup: they change only when the process
/// is restarted with another issuer or another key list.
#[derive(Clone)]
pub struct Documents {
    pub discovery: Discovery,
    pub jwks: Jwks,
}

/// `GET /.well-known/openid-configuration` and `GET /jwks.json`. Both are
/// public and change only on a rotation, whose procedure allows for the
/// hour they may be cached. A route layer, not `Router::layer`: the latter
/// would also wrap this router's default fallback, and once merged into the
/// root that fallback answers every unknown path outside `/api`.
pub fn router(documents: Documents) -> Router {
    Router::new()
        .route("/.well-known/openid-configuration", get(discovery))
        .route("/jwks.json", get(jwks))
        .route_layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=3600"),
        ))
        .with_state(documents)
}

async fn discovery(State(documents): State<Documents>) -> Json<Discovery> {
    Json(documents.discovery)
}

async fn jwks(State(documents): State<Documents>) -> Json<Jwks> {
    Json(documents.jwks)
}

#[cfg(test)]
mod tests {
    use std::convert::Infallible;

    use axum::body::{Body, to_bytes};
    use axum::http::{Request, Response, StatusCode, header};
    use openidconnect::core::{CoreJsonWebKey, CoreJwsSigningAlgorithm, CoreProviderMetadata};
    use openidconnect::{IssuerUrl, JsonWebKey, JsonWebKeyId};
    use tower::ServiceExt;

    use crate::http::app;
    use crate::oidc::SigningKeys;
    use crate::testing::{
        DEV_SIGNING_KEY as DEV_KEY, DEV_SIGNING_KEY_KID as DEV_KEY_KID, test_config,
    };

    async fn get(uri: &str) -> Response<Body> {
        app(test_config())
            .unwrap()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    async fn json(response: Response<Body>) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    fn header_value(response: &Response<Body>, name: header::HeaderName) -> Option<&str> {
        response
            .headers()
            .get(name)
            .map(|value| value.to_str().unwrap())
    }

    #[tokio::test]
    async fn discovery_is_served_publicly_cacheable_without_a_cookie() {
        let response = get("/.well-known/openid-configuration").await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            header_value(&response, header::CONTENT_TYPE),
            Some("application/json")
        );
        assert_eq!(
            header_value(&response, header::CACHE_CONTROL),
            Some("public, max-age=3600")
        );
        assert!(!response.headers().contains_key(header::SET_COOKIE));

        let body = json(response).await;
        assert_eq!(body["issuer"], test_config().issuer);
        assert!(
            body["jwks_uri"].as_str().unwrap().ends_with("/jwks.json"),
            "{body}"
        );
    }

    #[tokio::test]
    async fn jwks_publishes_the_dev_key() {
        for uri in ["/jwks.json", "/jwks.json/"] {
            let response = get(uri).await;

            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert_eq!(
                header_value(&response, header::CACHE_CONTROL),
                Some("public, max-age=3600"),
                "{uri}"
            );
            let body = json(response).await;
            let keys = body["keys"].as_array().unwrap();
            assert_eq!(keys.len(), 1, "{uri}");
            assert_eq!(keys[0]["kid"], DEV_KEY_KID, "{uri}");
        }
    }

    /// The acceptance criterion, checked by an independent implementation:
    /// `openidconnect` runs its own discovery against the router — the
    /// well-known URL derivation, the Discovery §4.3 issuer comparison and
    /// the `jwks_uri` fetch — and then verifies a JWS CAS produced against
    /// the key it found there.
    #[tokio::test]
    async fn a_standard_oidc_library_discovers_cas_and_verifies_its_signature() {
        let router = app(test_config()).unwrap();
        let client = move |request: openidconnect::HttpRequest| {
            let router = router.clone();
            async move {
                let (parts, body) = request.into_parts();
                let response = router
                    .oneshot(Request::from_parts(parts, Body::from(body)))
                    .await?;
                let (parts, body) = response.into_parts();
                let bytes = to_bytes(body, usize::MAX)
                    .await
                    .expect("the router's bodies are in memory");
                Ok::<_, Infallible>(openidconnect::HttpResponse::from_parts(
                    parts,
                    bytes.to_vec(),
                ))
            }
        };

        let metadata = CoreProviderMetadata::discover_async(
            IssuerUrl::new(test_config().issuer).unwrap(),
            &client,
        )
        .await
        .expect("discovery succeeds");

        let kid = JsonWebKeyId::new(DEV_KEY_KID.to_string());
        let key: &CoreJsonWebKey = metadata
            .jwks()
            .keys()
            .iter()
            .find(|key| key.key_id() == Some(&kid))
            .expect("the published key set holds the active key");

        let keys = SigningKeys::from_pem(DEV_KEY).unwrap();
        let jws = keys.active().sign("JWT", br#"{"hello":"world"}"#);
        let (signing_input, signature) = jws.rsplit_once('.').unwrap();
        let mut signature =
            base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, signature)
                .unwrap();

        key.verify_signature(
            &CoreJwsSigningAlgorithm::EcdsaP256Sha256,
            signing_input.as_bytes(),
            &signature,
        )
        .expect("the signature verifies against the published key");

        signature[10] ^= 0x01;
        assert!(
            key.verify_signature(
                &CoreJwsSigningAlgorithm::EcdsaP256Sha256,
                signing_input.as_bytes(),
                &signature,
            )
            .is_err(),
            "a flipped bit must not verify"
        );
    }
}
