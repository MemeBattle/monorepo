use std::collections::BTreeMap;
use std::marker::PhantomData;

use axum::{
    Json,
    extract::rejection::{JsonRejection, PathRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use utoipa::openapi::{RefOr, response::Response as OpenApiResponse};

use crate::db::Failure;
use crate::http::response::{ErrorShape, error_responses};

/// Transport-level HTTP error contract.
///
/// Domain modules keep their own error enums and map them into this type
/// with an [`api_errors!`](crate::api_errors) table next to the handler, so
/// the wire format stays in one place and every mapping also says which
/// codes it can produce ([`ErrorCodes`]), for the OpenAPI description.
///
/// Every failure the code can name gets a specific status and a stable code.
/// A 500 is reserved for what nobody anticipated — a panic, an error no
/// branch knows — and is treated as an incident, so no handler maps a known
/// condition to [`ApiError::internal`] on purpose.
#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    /// Stable machine-readable error code exposed to clients.
    code: &'static str,
    /// Client-facing message.
    message: String,
    /// Underlying error, logged for 5xx responses and never sent to clients.
    source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

/// The stable code of an error response, left in the response's extensions
/// by every error family that answers with one ([`ApiError`] always). Never
/// sent: it is how the tests' conformance check (`http::openapi`) reads the
/// code without parsing a body.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ErrorCode(pub &'static str);

impl ApiError {
    /// A named failure. The status is never 500: that is
    /// [`ApiError::internal`], for what the code cannot name.
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            source: None,
        }
    }

    pub fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, code, message)
    }

    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, code, message)
    }

    /// The underlying error, logged with a 5xx and never sent.
    fn with_source(self, source: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self {
            source: Some(source.into()),
            ..self
        }
    }

    /// The fallback for failures the code cannot name. Not for known
    /// conditions: give those their own status and code.
    pub fn internal(source: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: INTERNAL_ERROR,
            message: "Internal server error".to_owned(),
            source: Some(source.into()),
        }
    }
}

/// The code of [`ApiError::internal`]. The OpenAPI assembly describes it on
/// every operation; no table and no error set declares it.
pub const INTERNAL_ERROR: &str = "internal_error";

/// Renders `Json` extractor rejections (malformed body, wrong content-type)
/// in the standard error shape, keeping the rejection's status and message.
impl From<JsonRejection> for ApiError {
    fn from(rejection: JsonRejection) -> Self {
        Self::new(rejection.status(), INVALID_BODY, rejection.body_text())
    }
}

/// The code of a `Json` extractor rejection; see [`InvalidBody`].
pub(crate) const INVALID_BODY: &str = "invalid_body";

/// The code of a `Path` extractor rejection; see [`InvalidPath`].
pub(crate) const INVALID_PATH: &str = "invalid_path";

/// Renders `Path` extractor rejections (a segment that does not parse into
/// the handler's type) in the standard error shape. The status is the
/// rejection's own: 400 for a bad value, 500 for a route whose parameters do
/// not match its handler, which is a bug.
impl From<PathRejection> for ApiError {
    fn from(rejection: PathRejection) -> Self {
        Self::new(rejection.status(), INVALID_PATH, rejection.body_text())
    }
}

crate::api_errors! { Failure {
    Unavailable => SERVICE_UNAVAILABLE "database_unavailable":
        "The database is not available, try again later",
    Busy => SERVICE_UNAVAILABLE "database_busy": "The database was busy, try again",
} }

/// The one place a database error becomes a response: it maps the verdict of
/// [`crate::db::classify`] onto a status. A failure the classifier can name is
/// a known, retryable condition (503, from the [`Failure`] table above);
/// anything it cannot name is a bug and takes the 500 fallback.
impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        match crate::db::classify(&error) {
            Some(failure) => Self::from(failure).with_source(error),
            None => Self::internal(error),
        }
    }
}

/// A database error can become exactly what [`Failure`] maps to.
impl ErrorCodes for sqlx::Error {
    fn codes() -> Vec<(StatusCode, &'static str)> {
        Failure::codes()
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if self.status.is_server_error() {
            tracing::error!(status = %self.status, code = self.code, source = ?self.source, "server error");
        }
        let body = json!({
            "error": {
                "code": self.code,
                "message": self.message,
            }
        });
        let mut response = (self.status, Json(body)).into_response();
        response.extensions_mut().insert(ErrorCode(self.code));
        response
    }
}

/// The known `(status, code)` pairs a type can turn into on the wire. 500 is
/// never among them: the fallback is described once, for every operation,
/// by the OpenAPI assembly.
pub trait ErrorCodes {
    fn codes() -> Vec<(StatusCode, &'static str)>;
}

/// The codes of the error a tuple variant wraps, found from the variant's
/// constructor so that a table does not have to name the wrapped type.
pub fn codes_via<T: ErrorCodes, E>(_variant: fn(T) -> E) -> Vec<(StatusCode, &'static str)> {
    T::codes()
}

/// The message a whole-type [`api_errors!`](crate::api_errors) table builds
/// from the error.
#[doc(hidden)]
pub fn message_of<E, M: Into<String>>(error: &E, message: impl FnOnce(&E) -> M) -> String {
    message(error).into()
}

/// One table per domain error: the single source of both
/// `From<DomainError> for ApiError` and [`ErrorCodes`], so the mapping and
/// the codes the description lists cannot drift apart. A table that misses
/// a variant does not compile.
///
/// ```ignore
/// api_errors! { ManagementError {
///     // Status and code; the message is the error's `Display`.
///     NotFound => NOT_FOUND "passkey_not_found",
///     // The same with a fixed message.
///     Rejected(_) => UNAUTHORIZED "invalid_credential": "The credential is not registered",
///     // Delegates to the wrapped error's mapping and inherits its codes.
///     Db(_) => from,
///     // The 500 fallback: nothing the code can name, no code declared.
///     Webauthn(_) => internal,
/// } }
///
/// // A whole type mapped to one code, the message built from the error.
/// api_errors!(EmailError => BAD_REQUEST "invalid_email", |error| format!("Invalid email: {error}"));
/// ```
///
/// `STATUS` is the name of a [`StatusCode`] constant, and never
/// `INTERNAL_SERVER_ERROR` (checked while compiling). Struct-like variants
/// are not supported.
#[macro_export]
macro_rules! api_errors {
    // A whole type that maps to one code.
    ($ty:ty => $status:ident $code:literal, $message:expr $(,)?) => {
        $crate::api_errors!(@not_internal $status);

        impl ::core::convert::From<$ty> for $crate::http::error::ApiError {
            fn from(error: $ty) -> Self {
                $crate::http::error::ApiError::new(
                    ::axum::http::StatusCode::$status,
                    $code,
                    $crate::http::error::message_of(&error, $message),
                )
            }
        }

        impl $crate::http::error::ErrorCodes for $ty {
            fn codes() -> ::std::vec::Vec<(::axum::http::StatusCode, &'static str)> {
                ::std::vec![(::axum::http::StatusCode::$status, $code)]
            }
        }
    };

    // An enum, one arm per variant.
    ($ty:ty { $($body:tt)+ }) => {
        $crate::api_errors!(@munch [$ty] [error codes] arms{} declared{} $($body)+);
    };

    // The variant wraps another mapped error: delegate, and inherit its codes.
    (@munch [$ty:ty] [$error:ident $codes:ident] arms{$($arms:tt)*} declared{$($declared:tt)*}
        $variant:ident(_) => from, $($rest:tt)*) => {
        $crate::api_errors!(@munch [$ty] [$error $codes]
            arms{$($arms)* E::$variant(inner) => $crate::http::error::ApiError::from(inner),}
            declared{$($declared)* $codes.extend($crate::http::error::codes_via(E::$variant));}
            $($rest)*);
    };

    // Nothing the code can name: the 500 fallback, which declares no code.
    (@munch [$ty:ty] [$error:ident $codes:ident] arms{$($arms:tt)*} declared{$($declared:tt)*}
        $variant:ident(_) => internal, $($rest:tt)*) => {
        $crate::api_errors!(@munch [$ty] [$error $codes]
            arms{$($arms)* E::$variant(inner) => $crate::http::error::ApiError::internal(inner),}
            declared{$($declared)*}
            $($rest)*);
    };

    // A named failure: status and code, the message from `Display` unless
    // the table gives one.
    (@munch [$ty:ty] [$error:ident $codes:ident] arms{$($arms:tt)*} declared{$($declared:tt)*}
        $variant:ident $(($skip:tt))? => $status:ident $code:literal $(: $message:expr)?, $($rest:tt)*) => {
        $crate::api_errors!(@not_internal $status);
        $crate::api_errors!(@munch [$ty] [$error $codes]
            arms{$($arms)* E::$variant $(($skip))? => $crate::http::error::ApiError::new(
                ::axum::http::StatusCode::$status,
                $code,
                $crate::api_errors!(@message $error $(, $message)?),
            ),}
            declared{$($declared)* $codes.push((::axum::http::StatusCode::$status, $code));}
            $($rest)*);
    };

    (@munch [$ty:ty] [$error:ident $codes:ident] arms{$($arms:tt)*} declared{$($declared:tt)*}) => {
        impl ::core::convert::From<$ty> for $crate::http::error::ApiError {
            fn from($error: $ty) -> Self {
                type E = $ty;
                match $error { $($arms)* }
            }
        }

        impl $crate::http::error::ErrorCodes for $ty {
            // One statement per arm, whatever the arm contributes.
            #[allow(clippy::vec_init_then_push)]
            fn codes() -> ::std::vec::Vec<(::axum::http::StatusCode, &'static str)> {
                #[allow(dead_code)]
                type E = $ty;
                #[allow(unused_mut)]
                let mut $codes = ::std::vec::Vec::new();
                $($declared)*
                $codes
            }
        }
    };

    (@message $error:ident) => { $error.to_string() };
    (@message $error:ident, $message:expr) => { $message };

    (@not_internal $status:ident) => {
        const _: () = ::core::assert!(
            ::axum::http::StatusCode::$status.as_u16() != 500,
            "500 is the fallback for what the code cannot name; map it with `internal`",
        );
    };
}

/// A handler's error set: every `(status, code)` its error type can carry,
/// declared by [`error_set!`](crate::error_set).
pub trait ErrorSet {
    fn codes() -> Vec<(StatusCode, &'static str)>;
}

/// The set `Self` admits the error `E`: a `?` on an `E` converts into
/// [`ApiErrors<Self>`].
pub trait Declares<E> {}

/// What a handler fails with: an [`ApiError`] that can only have come from
/// one of the errors the set `S` declares, so the description of the
/// handler's errors is its signature. A `?` on an error outside the set does
/// not compile.
pub struct ApiErrors<S>(ApiError, PhantomData<S>);

impl<E, S> From<E> for ApiErrors<S>
where
    E: Into<ApiError> + ErrorCodes,
    S: Declares<E>,
{
    fn from(error: E) -> Self {
        Self(error.into(), PhantomData)
    }
}

impl<S> IntoResponse for ApiErrors<S> {
    fn into_response(self) -> Response {
        self.0.into_response()
    }
}

impl<S: ErrorSet> utoipa::IntoResponses for ApiErrors<S> {
    fn responses() -> BTreeMap<String, RefOr<OpenApiResponse>> {
        error_responses(&S::codes(), ErrorShape::Api)
    }
}

/// Declares a handler's error set: the domain errors its body converts with
/// `?` and the markers of the extractors in its signature, whose rejections
/// the handler never sees but answers with all the same.
///
/// ```ignore
/// error_set!(RenameErrors: Authenticated, InvalidPath, InvalidBody, PasskeyNameError, ManagementError);
/// ```
#[macro_export]
macro_rules! error_set {
    ($vis:vis $name:ident: $($error:ty),+ $(,)?) => {
        $vis struct $name;

        $(impl $crate::http::error::Declares<$error> for $name {})+

        impl $crate::http::error::ErrorSet for $name {
            fn codes() -> ::std::vec::Vec<(::axum::http::StatusCode, &'static str)> {
                let mut codes = ::std::vec::Vec::new();
                $(codes.extend(<$error as $crate::http::error::ErrorCodes>::codes());)+
                codes.sort();
                codes.dedup();
                codes
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::db_error;

    fn mapped(error: sqlx::Error) -> (StatusCode, &'static str) {
        let api = ApiError::from(error);
        (api.status, api.code)
    }

    #[test]
    fn an_unavailable_database_is_service_unavailable() {
        assert_eq!(
            mapped(sqlx::Error::PoolTimedOut),
            (StatusCode::SERVICE_UNAVAILABLE, "database_unavailable")
        );
    }

    #[test]
    fn a_busy_database_is_service_unavailable() {
        assert_eq!(
            mapped(db_error("40P01")),
            (StatusCode::SERVICE_UNAVAILABLE, "database_busy")
        );
    }

    /// A failure the classifier has no name for — here a constraint violation
    /// the caller forgot to handle — takes the 500 fallback.
    #[test]
    fn an_unclassified_failure_stays_internal() {
        assert_eq!(
            mapped(db_error("23505")),
            (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
        );
    }

    /// The table keeps today's messages and attaches the database error as
    /// the source, for the log.
    #[test]
    fn the_database_mapping_keeps_its_messages_and_its_source() {
        let unavailable = ApiError::from(sqlx::Error::PoolTimedOut);
        assert_eq!(
            unavailable.message,
            "The database is not available, try again later"
        );
        assert!(unavailable.source.is_some());
        assert_eq!(
            ApiError::from(db_error("40001")).message,
            "The database was busy, try again"
        );
    }

    #[derive(Debug, thiserror::Error)]
    enum Probe {
        #[error("nothing here")]
        Missing,
        #[error("taken by {0}")]
        Taken(String),
        #[error("refused")]
        Refused(String),
        #[error(transparent)]
        Db(sqlx::Error),
        #[error("broken")]
        Broken(std::io::Error),
    }

    crate::api_errors! { Probe {
        Missing => NOT_FOUND "probe_missing",
        Taken(_) => CONFLICT "probe_taken",
        Refused(_) => FORBIDDEN "probe_refused": "Refused, whatever the reason",
        Db(_) => from,
        Broken(_) => internal,
    } }

    #[derive(Debug, thiserror::Error)]
    #[error("too short")]
    struct Short;

    crate::api_errors!(Short => BAD_REQUEST "probe_short", |error| format!("Invalid probe: {error}"));

    fn emitted(error: impl Into<ApiError>) -> (StatusCode, &'static str) {
        let api = error.into();
        (api.status, api.code)
    }

    /// The table yields both halves: every pair the mapping emits is listed
    /// by `codes()`, the delegated database codes included, and nothing
    /// else is listed.
    #[test]
    fn a_table_yields_the_same_pairs_from_the_mapping_and_from_its_codes() {
        let pairs = [
            emitted(Probe::Missing),
            emitted(Probe::Taken("Ada".to_owned())),
            emitted(Probe::Refused("why".to_owned())),
            emitted(Probe::Db(sqlx::Error::PoolTimedOut)),
            emitted(Probe::Db(db_error("40P01"))),
        ];

        assert_eq!(Probe::codes(), pairs);
        assert_eq!(Short::codes(), [emitted(Short)]);
    }

    /// The fallback is the one arm that names no code: it maps to 500 and
    /// `codes()` leaves it out, as does the database's own fallback.
    #[test]
    fn internal_arms_contribute_no_code() {
        assert_eq!(
            emitted(Probe::Broken(std::io::Error::other("disk"))),
            (StatusCode::INTERNAL_SERVER_ERROR, INTERNAL_ERROR)
        );
        assert_eq!(
            emitted(Probe::Db(db_error("23505"))),
            (StatusCode::INTERNAL_SERVER_ERROR, INTERNAL_ERROR)
        );
        for (status, _) in Probe::codes().into_iter().chain(sqlx::Error::codes()) {
            assert_ne!(status, StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    /// Messages: `Display` by default, with or without a payload; the given
    /// text when the table has one; the closure's for a whole type.
    #[test]
    fn messages_follow_the_table() {
        assert_eq!(ApiError::from(Probe::Missing).message, "nothing here");
        assert_eq!(
            ApiError::from(Probe::Taken("Ada".to_owned())).message,
            "taken by Ada"
        );
        assert_eq!(
            ApiError::from(Probe::Refused("why".to_owned())).message,
            "Refused, whatever the reason"
        );
        assert_eq!(ApiError::from(Short).message, "Invalid probe: too short");
    }

    crate::error_set!(ProbeErrors: Probe, Short, sqlx::Error);

    /// A set is the union of its members' codes, sorted, each pair once:
    /// the database codes come both from `Probe` and from `sqlx::Error`.
    #[test]
    fn an_error_set_merges_and_deduplicates() {
        assert_eq!(
            ProbeErrors::codes(),
            [
                (StatusCode::BAD_REQUEST, "probe_short"),
                (StatusCode::FORBIDDEN, "probe_refused"),
                (StatusCode::NOT_FOUND, "probe_missing"),
                (StatusCode::CONFLICT, "probe_taken"),
                (StatusCode::SERVICE_UNAVAILABLE, "database_busy"),
                (StatusCode::SERVICE_UNAVAILABLE, "database_unavailable"),
            ]
        );
    }

    /// The code travels with the response for the conformance check, and
    /// the body is the contract's shape.
    #[tokio::test]
    async fn the_response_carries_its_code() {
        let response = ApiErrors::<ProbeErrors>::from(Probe::Missing).into_response();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.extensions().get::<ErrorCode>(),
            Some(&ErrorCode("probe_missing"))
        );
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            body,
            json!({"error": {"code": "probe_missing", "message": "nothing here"}})
        );
    }
}
