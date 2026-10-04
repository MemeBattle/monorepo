//! The client id newtype: the OIDC `client_id`, chosen by hand when a client
//! is registered. How it crosses the database boundary is the repository's
//! business (`repository.rs`).

use nutype::nutype;

/// Upper bound on a client id, in characters. A hand-chosen slug never needs
/// more, and the id travels in query strings, `Basic` credentials and logs.
pub const MAX_CLIENT_ID_LENGTH: usize = 64;

/// Why a string is not a [`ClientId`]: one variant per rule, so the message
/// names the rule broken.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ClientIdError {
    #[error("must not be empty")]
    Empty,

    #[error("must be at most {MAX_CLIENT_ID_LENGTH} characters")]
    TooLong,

    #[error("must contain only lowercase ASCII letters, digits, '.', '_' and '-'")]
    DisallowedCharacter,
}

/// The slug rules. [`super::Audience`] is held to them too.
pub(super) fn validate_client_id(value: &str) -> Result<(), ClientIdError> {
    if value.is_empty() {
        return Err(ClientIdError::Empty);
    }
    if value.len() > MAX_CLIENT_ID_LENGTH {
        return Err(ClientIdError::TooLong);
    }
    if !value
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'))
    {
        return Err(ClientIdError::DisallowedCharacter);
    }

    Ok(())
}

/// The OIDC `client_id`: a slug an operator picks (`ligretto`), not a
/// generated identifier. The character set is deliberately narrow — the value
/// is copied into query strings, `Basic` credentials, configuration files and
/// logs, where an uppercase letter, a space or a non-ASCII character would
/// only be a way for two clients to look alike. Deserialising re-validates,
/// so a received value is as safe as a freshly constructed one.
#[nutype(
    sanitize(trim),
    validate(with = validate_client_id, error = ClientIdError),
    derive(Debug, Clone, PartialEq, Eq, Hash, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct ClientId(String);

#[cfg(test)]
mod tests {
    use super::*;

    fn id(value: &str) -> Result<String, ClientIdError> {
        ClientId::try_new(value).map(Into::into)
    }

    #[test]
    fn accepts_a_hand_chosen_slug() {
        for value in [
            "ligretto",
            "my-app.v2",
            "app_2",
            "a",
            &"a".repeat(MAX_CLIENT_ID_LENGTH),
        ] {
            assert_eq!(
                id(value),
                Ok(value.to_owned()),
                "{value:?} must be accepted"
            );
        }
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(id("  ligretto\n"), Ok("ligretto".to_owned()));
    }

    #[test]
    fn rejects_the_empty_and_the_over_long() {
        assert_eq!(id(""), Err(ClientIdError::Empty));
        assert_eq!(id("   "), Err(ClientIdError::Empty));
        assert_eq!(
            id(&"a".repeat(MAX_CLIENT_ID_LENGTH + 1)),
            Err(ClientIdError::TooLong)
        );
    }

    #[test]
    fn rejects_anything_outside_the_character_set() {
        for value in [
            "Ligretto",
            "lig retto",
            "ligretto/admin",
            "лигретто",
            "ligretto:1",
            "ligretto%20",
        ] {
            assert_eq!(
                id(value),
                Err(ClientIdError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }
    }

    #[test]
    fn deserialising_validates() {
        assert!(serde_json::from_str::<ClientId>("\"Ligretto\"").is_err());
        let ok: ClientId = serde_json::from_str("\" ligretto \"").unwrap();
        assert_eq!(ok.as_ref(), "ligretto");
    }
}
