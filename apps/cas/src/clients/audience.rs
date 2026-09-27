//! The audience newtype: the `aud` of the access tokens issued to a client
//! (RFC 9068 §3), configured per client. How it crosses the database
//! boundary is the repository's business (`repository.rs`).

use nutype::nutype;

use super::ClientId;
use super::client_id::{ClientIdError, validate_client_id};

/// The resource server a client's access tokens are meant for (`ligretto`),
/// which is not the client itself when two clients share one. Held to the
/// client id's grammar — `[a-z0-9._-]`, at most 64 characters — for the same
/// reason (ADR 0008 (a)): the value is configured on CAS and on the resource
/// server alike, logged, and compared byte for byte, and a narrow character
/// set is what keeps two resources from looking alike. It also makes every
/// client id a valid audience, which is the default. A URI-shaped resource
/// indicator (RFC 8707) is not needed by any planned resource server;
/// widening the grammar later keeps every stored value valid, narrowing it
/// would not. See `docs/adr/0011-token-endpoint-and-access-tokens.md`.
#[nutype(
    sanitize(trim),
    validate(with = validate_client_id, error = ClientIdError),
    derive(Debug, Clone, PartialEq, Eq, Hash, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct Audience(String);

impl From<&ClientId> for Audience {
    /// A client is its own audience unless registration names another.
    fn from(id: &ClientId) -> Self {
        Self::try_new(id.as_str()).expect("a client id satisfies the audience grammar")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_client_id_is_an_audience() {
        let id = ClientId::try_new("ligretto.v2_b-1").unwrap();

        assert_eq!(Audience::from(&id).as_str(), "ligretto.v2_b-1");
    }

    #[test]
    fn the_client_id_rules_apply() {
        assert_eq!(Audience::try_new(""), Err(ClientIdError::Empty));
        assert_eq!(
            Audience::try_new("a".repeat(65)),
            Err(ClientIdError::TooLong)
        );
        for value in ["Ligretto", "https://api.example", "lig retto", "urn:x"] {
            assert_eq!(
                Audience::try_new(value),
                Err(ClientIdError::DisallowedCharacter),
                "{value:?}"
            );
        }
        assert_eq!(
            Audience::try_new(" ligretto ").unwrap().as_str(),
            "ligretto"
        );
    }
}
