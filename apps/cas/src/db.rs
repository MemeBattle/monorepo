//! Shared database infrastructure: how a `sqlx::Error` is classified for
//! callers that must decide whether a failure is the caller's to retry.

/// SQLSTATE classes that say the database, not the statement, is the problem:
/// `08` connection exception, `53` insufficient resources, `57` operator
/// intervention (`57P01`, the FATAL a restart or a failover sends on an
/// established connection), `58` system error. All of them arrive as
/// [`sqlx::Error::Database`], which is why the pool variants alone are not
/// enough to recognise an outage.
const UNAVAILABLE_CLASSES: [&str; 4] = ["08", "53", "57", "58"];

/// Serialization failure and deadlock: the database is up and the statement is
/// fine, this transaction simply lost. Retrying it is the documented fix, so it
/// gets its own code rather than the generic unavailability one.
const SERIALIZATION_FAILURE: &str = "40001";
const DEADLOCK_DETECTED: &str = "40P01";

/// Why a database error is the client's to retry rather than an incident.
pub enum Failure {
    /// The database is not reachable or not accepting work.
    Unavailable,
    /// The database rejected this transaction under contention.
    Busy,
}

/// Classifies a database failure. `None` means the code has no name for it —
/// a constraint the caller did not expect, a row that will not decode, a query
/// the schema no longer matches — and it is a bug rather than a retryable
/// condition.
pub fn classify(error: &sqlx::Error) -> Option<Failure> {
    match error {
        sqlx::Error::PoolTimedOut
        | sqlx::Error::PoolClosed
        | sqlx::Error::Io(_)
        | sqlx::Error::Tls(_)
        // A broken or unexpected protocol exchange, and a BEGIN that did not
        // take: both mean the connection, not the query, went wrong.
        | sqlx::Error::Protocol(_)
        | sqlx::Error::BeginFailed => Some(Failure::Unavailable),
        sqlx::Error::Database(db) => match db.code().as_deref() {
            Some(SERIALIZATION_FAILURE | DEADLOCK_DETECTED) => Some(Failure::Busy),
            Some(code) if UNAVAILABLE_CLASSES.iter().any(|class| code.starts_with(class)) => {
                Some(Failure::Unavailable)
            }
            _ => None,
        },
        _ => None,
    }
}

/// Test-only fixtures other modules reuse to build database errors the driver
/// only ever produces from a real server message.
#[cfg(test)]
pub(crate) mod test_support {
    use sqlx::error::{DatabaseError, ErrorKind};
    use std::borrow::Cow;

    /// A database error carrying a chosen SQLSTATE. The driver only builds
    /// these from a real server message, and the failures worth testing here —
    /// a shutdown, a deadlock — cannot be provoked from a unit test.
    #[derive(Debug)]
    pub(crate) struct FakeDbError {
        pub(crate) code: String,
    }

    impl std::fmt::Display for FakeDbError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "fake database error {}", self.code)
        }
    }

    impl std::error::Error for FakeDbError {}

    impl DatabaseError for FakeDbError {
        fn message(&self) -> &str {
            "fake database error"
        }

        fn code(&self) -> Option<Cow<'_, str>> {
            Some(Cow::Borrowed(&self.code))
        }

        fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
            self
        }

        fn kind(&self) -> ErrorKind {
            match self.code.as_str() {
                "23505" => ErrorKind::UniqueViolation,
                _ => ErrorKind::Other,
            }
        }
    }

    /// Builds a [`sqlx::Error::Database`] carrying `code`.
    pub(crate) fn db_error(code: &str) -> sqlx::Error {
        sqlx::Error::Database(Box::new(FakeDbError {
            code: code.to_owned(),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::db_error;
    use super::*;

    #[test]
    fn a_pool_timeout_is_unavailable() {
        assert!(matches!(
            classify(&sqlx::Error::PoolTimedOut),
            Some(Failure::Unavailable)
        ));
    }

    /// 57P01: the FATAL Postgres sends when an admin, a restart or a failover
    /// terminates the connection. It arrives on an established connection, so
    /// no pool variant sees it.
    #[test]
    fn a_terminated_connection_is_unavailable() {
        assert!(matches!(
            classify(&db_error("57P01")),
            Some(Failure::Unavailable)
        ));
    }

    #[test]
    fn a_connection_exception_is_unavailable() {
        assert!(matches!(
            classify(&db_error("08006")),
            Some(Failure::Unavailable)
        ));
    }

    #[test]
    fn a_deadlock_is_a_busy_database() {
        assert!(matches!(classify(&db_error("40P01")), Some(Failure::Busy)));
    }

    #[test]
    fn a_serialization_failure_is_a_busy_database() {
        assert!(matches!(classify(&db_error("40001")), Some(Failure::Busy)));
    }

    /// A constraint violation is a caller that forgot to handle it: a bug, not
    /// a retryable outage.
    #[test]
    fn a_unique_violation_is_not_classified() {
        assert!(classify(&db_error("23505")).is_none());
    }

    #[test]
    fn a_decode_error_is_not_classified() {
        assert!(classify(&sqlx::Error::Decode("not a uuid".into())).is_none());
    }
}
