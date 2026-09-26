//! A scope token: one entry of the allow-list a client may request from
//! `/authorize`.

use nutype::nutype;

/// Why a string is not a [`Scope`]: one variant per rule, so the message
/// names the rule broken.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ScopeError {
    #[error("must not be empty")]
    Empty,

    #[error("must contain only printable ASCII characters other than ' ', '\"' and '\\'")]
    DisallowedCharacter,
}

/// RFC 6749 §3.3 `scope-token`: `%x21 / %x23-5B / %x5D-7E` — printable ASCII
/// without the space that separates two tokens, the double quote and the
/// backslash.
fn is_scope_token_byte(b: u8) -> bool {
    matches!(b, 0x21 | 0x23..=0x5b | 0x5d..=0x7e)
}

fn validate_scope(value: &str) -> Result<(), ScopeError> {
    if value.is_empty() {
        return Err(ScopeError::Empty);
    }
    if !value.bytes().all(is_scope_token_byte) {
        return Err(ScopeError::DisallowedCharacter);
    }

    Ok(())
}

/// A single OAuth scope token (`openid`, `profile`, `urn:memebattle:x`).
/// Not sanitised: a scope is matched exactly, and the space that a trim would
/// remove is the character that separates two tokens in a request, so a value
/// containing one is a mistake rather than something to tidy up.
#[nutype(
    validate(with = validate_scope, error = ScopeError),
    derive(Debug, Clone, PartialEq, Eq, Hash, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct Scope(String);

#[cfg(test)]
mod tests {
    use super::*;

    fn scope(value: &str) -> Result<String, ScopeError> {
        Scope::try_new(value).map(Into::into)
    }

    #[test]
    fn accepts_a_scope_token() {
        for value in ["openid", "profile", "email", "urn:memebattle:x", "a"] {
            assert_eq!(
                scope(value),
                Ok(value.to_owned()),
                "{value:?} must be accepted"
            );
        }
    }

    #[test]
    fn rejects_the_empty_and_what_is_not_a_scope_token() {
        assert_eq!(scope(""), Err(ScopeError::Empty));
        for value in [
            "openid profile",
            " openid",
            "open\"id",
            "open\\id",
            "openid\n",
            "идентификация",
        ] {
            assert_eq!(
                scope(value),
                Err(ScopeError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }
    }
}
