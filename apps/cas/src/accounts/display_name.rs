//! The display name newtype: an account's user-facing name under the shared
//! label rules. How it crosses the database boundary is the repository's
//! business (`repository.rs`).

use nutype::nutype;

use crate::shared::label::{LabelError, sanitize_label, validate_label};

/// Why a string is not a [`DisplayName`]: the label rules, under a name of
/// this context's own so the transport can give it its own error code.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error(transparent)]
pub struct DisplayNameError(LabelError);

fn validate_display_name(value: &str) -> Result<(), DisplayNameError> {
    validate_label(value).map_err(DisplayNameError)
}

/// A user-facing name, valid by construction under the label rules
/// (`crate::shared::label`): sanitised (space mapping, NFC, trimming) and
/// validated (no invisible or unassigned characters, length cap), so every
/// UI and every authenticator prompt can show it as-is. Deserialising
/// re-validates, so a stored or received value is as safe as a freshly
/// constructed one.
#[nutype(
    sanitize(with = sanitize_label),
    validate(with = validate_display_name, error = DisplayNameError),
    derive(Debug, Clone, PartialEq, Eq, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct DisplayName(String);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::label::MAX_LABEL_LENGTH;

    /// The label rules apply; the rules themselves are tested where they
    /// live, in `shared::label`.
    #[test]
    fn a_display_name_is_a_sanitised_valid_label() {
        assert_eq!(
            DisplayName::try_new("  Ada\u{a0} Lovelace ").map(Into::<String>::into),
            Ok("Ada Lovelace".to_owned())
        );
        assert_eq!(
            DisplayName::try_new(""),
            Err(DisplayNameError(LabelError::Empty))
        );
        assert_eq!(
            DisplayName::try_new("Ada\u{200b}"),
            Err(DisplayNameError(LabelError::DisallowedCharacter))
        );
        assert_eq!(
            DisplayName::try_new("a".repeat(MAX_LABEL_LENGTH + 1)),
            Err(DisplayNameError(LabelError::TooLong))
        );
    }

    #[test]
    fn deserialising_validates() {
        let error = serde_json::from_str::<DisplayName>("\"\"").unwrap_err();
        assert!(error.to_string().contains("must not be empty"));

        for value in ["\u{034f}", "\u{fe0f}", "\u{3164}"] {
            let json = serde_json::to_string(value).unwrap();
            assert!(serde_json::from_str::<DisplayName>(&json).is_err());
        }

        let ok: DisplayName = serde_json::from_str("\"  Ada  \"").unwrap();
        assert_eq!(ok.as_ref(), "Ada");
    }
}
