//! The client name newtype: what a consent screen and the admin panel show
//! for a client, under the shared label rules. How it crosses the database
//! boundary is the repository's business (`repository.rs`).

use nutype::nutype;

use crate::shared::label::{LabelError, sanitize_label, validate_label};

/// Why a string is not a [`ClientName`]: the label rules, under a name of
/// this context's own so a transport can give it its own error code.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error(transparent)]
pub struct ClientNameError(LabelError);

fn validate_client_name(value: &str) -> Result<(), ClientNameError> {
    validate_label(value).map_err(ClientNameError)
}

/// The display name of a client ("Ligretto"), valid by construction under the
/// shared label rules (`crate::shared::label`): sanitised (space mapping,
/// NFC, trimming) and validated (no invisible or direction-changing
/// characters, length cap). A consent screen shows it next to the scopes a
/// user is about to grant, so it is held to the same rules as any other
/// user-facing label.
#[nutype(
    sanitize(with = sanitize_label),
    validate(with = validate_client_name, error = ClientNameError),
    derive(Debug, Clone, PartialEq, Eq, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct ClientName(String);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::label::MAX_LABEL_LENGTH;

    /// The label rules apply; the rules themselves are tested where they
    /// live, in `shared::label`.
    #[test]
    fn a_client_name_is_a_sanitised_valid_label() {
        assert_eq!(
            ClientName::try_new("  Ligretto\u{a0} Web ").map(Into::<String>::into),
            Ok("Ligretto Web".to_owned())
        );
        assert_eq!(
            ClientName::try_new(""),
            Err(ClientNameError(LabelError::Empty))
        );
        assert_eq!(
            ClientName::try_new("Ligretto\u{200b}"),
            Err(ClientNameError(LabelError::DisallowedCharacter))
        );
        assert_eq!(
            ClientName::try_new("a".repeat(MAX_LABEL_LENGTH + 1)),
            Err(ClientNameError(LabelError::TooLong))
        );
    }
}
