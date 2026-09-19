//! The email newtype: an account's optional address, accepted on its syntax
//! alone and stored unverified in v1 (`docs/PLAN.md`). The rules are the
//! ones a form can explain and a typo is caught by; deliverability is what
//! the verification flow of a later milestone proves. See
//! `docs/adr/0007-account-email.md`. How it crosses the database boundary is
//! the repository's business (`repository.rs`).

use nutype::nutype;
use thiserror::Error;
use unicode_general_category::{GeneralCategory, get_general_category};

/// Upper bound on an address, in characters. RFC 5321 caps a forward path
/// at 256 octets with its angle brackets, so no mail system has to accept an
/// address longer than 254, and nothing longer could ever be delivered to.
pub const MAX_EMAIL_LENGTH: usize = 254;

/// Why a string is not an [`Email`]. Each variant is a sentence the form can
/// show next to the field.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum EmailError {
    #[error("must not be empty")]
    Empty,

    #[error("must be at most {MAX_EMAIL_LENGTH} characters")]
    TooLong,

    /// Whitespace inside the address, a control character, or an invisible
    /// one (zero-width space, bidi override): none of them can be part of a
    /// mailbox, and all of them make one address look like another.
    #[error("must not contain spaces, control or invisible characters")]
    DisallowedCharacter,

    #[error("must contain an @")]
    MissingAt,

    #[error("must contain a single @")]
    MultipleAt,

    #[error("must have a name before the @")]
    EmptyLocalPart,

    #[error("must have a domain after the @")]
    EmptyDomain,

    /// A dot at either end of the domain or two in a row: `ada@example.` and
    /// `ada@.com` are typos, not domains.
    #[error("the domain must be labels separated by single dots")]
    InvalidDomain,
}

/// Lower-cases what follows the last `@` and leaves the rest alone. Domain
/// names are case-insensitive, so `Example.COM` and `example.com` name one
/// place and the stored form should say so. The local part is not touched:
/// RFC 5321 leaves its case to the receiving host, and rewriting it could
/// name another mailbox.
fn lowercase_domain(value: String) -> String {
    match value.rsplit_once('@') {
        Some((local, domain)) => format!("{local}@{}", domain.to_lowercase()),
        None => value,
    }
}

/// Whitespace of any kind, plus the general categories that are never text:
/// controls, format characters (invisible), line and paragraph separators,
/// surrogates, private use, unassigned.
fn is_disallowed_character(c: char) -> bool {
    c.is_whitespace()
        || matches!(
            get_general_category(c),
            GeneralCategory::Control
                | GeneralCategory::Format
                | GeneralCategory::LineSeparator
                | GeneralCategory::ParagraphSeparator
                | GeneralCategory::Surrogate
                | GeneralCategory::PrivateUse
                | GeneralCategory::Unassigned
        )
}

/// The syntactic rules, in the order a user would want to hear about them.
/// Runs on the sanitised value: trimmed, domain lower-cased.
fn validate_email(value: &str) -> Result<(), EmailError> {
    if value.is_empty() {
        return Err(EmailError::Empty);
    }
    if value.chars().count() > MAX_EMAIL_LENGTH {
        return Err(EmailError::TooLong);
    }
    if value.chars().any(is_disallowed_character) {
        return Err(EmailError::DisallowedCharacter);
    }
    let Some((local, domain)) = value.split_once('@') else {
        return Err(EmailError::MissingAt);
    };
    if domain.contains('@') {
        return Err(EmailError::MultipleAt);
    }
    if local.is_empty() {
        return Err(EmailError::EmptyLocalPart);
    }
    if domain.is_empty() {
        return Err(EmailError::EmptyDomain);
    }
    if domain.split('.').any(str::is_empty) {
        return Err(EmailError::InvalidDomain);
    }

    Ok(())
}

/// An account's email address, valid by construction under the syntactic
/// rules of this module: surrounding whitespace trimmed, the domain
/// lower-cased, then exactly one `@` with something on both sides, the
/// domain made of non-empty dot-separated labels, no whitespace, control or
/// invisible characters anywhere, at most [`MAX_EMAIL_LENGTH`] characters.
/// Nothing more: no attempt to say whether the address exists or can
/// receive mail, which is the verification flow's job when it arrives.
/// Non-ASCII local parts and domains are accepted as typed; the rules are
/// about shape, not alphabet.
#[nutype(
    sanitize(trim, with = lowercase_domain),
    validate(with = validate_email, error = EmailError),
    derive(Debug, Clone, PartialEq, Eq, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct Email(String);

#[cfg(test)]
mod tests {
    use super::*;

    fn email(value: &str) -> Result<String, EmailError> {
        Email::try_new(value).map(Into::into)
    }

    #[test]
    fn keeps_an_ordinary_address() {
        for value in [
            "ada@example.com",
            "ada.lovelace+cas@mail.example.co.uk",
            "o'brien@example.org",
            "ada@localhost",
            "ада@пример.рф",
            "李雷@example.com",
        ] {
            assert_eq!(email(value), Ok(value.to_owned()));
        }
    }

    #[test]
    fn trims_and_lowercases_the_domain_only() {
        assert_eq!(
            email("  Ada.Lovelace@Example.COM\n"),
            Ok("Ada.Lovelace@example.com".to_owned())
        );
        assert_eq!(
            email("\u{a0}ada@example.com\t"),
            Ok("ada@example.com".to_owned())
        );
    }

    #[test]
    fn rejects_empty_addresses() {
        for value in ["", "   ", "\u{a0}"] {
            assert_eq!(email(value), Err(EmailError::Empty), "{value:?}");
        }
    }

    #[test]
    fn rejects_addresses_over_the_limit() {
        let domain = "@example.com";
        let longest = format!("{}{domain}", "a".repeat(MAX_EMAIL_LENGTH - domain.len()));
        assert!(email(&longest).is_ok());
        assert_eq!(email(&format!("a{longest}")), Err(EmailError::TooLong));
    }

    #[test]
    fn rejects_spaces_control_and_invisible_characters() {
        for value in [
            "ada lovelace@example.com",
            "ada@exam ple.com",
            "ada\u{7}@example.com",
            "ada\u{200b}@example.com",
            "\u{202e}ada@example.com",
            "ada@example.com\u{feff}",
            "ada@\u{2028}example.com",
            "ada\u{e000}@example.com",
        ] {
            assert_eq!(
                email(value),
                Err(EmailError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }
    }

    #[test]
    fn requires_exactly_one_at_with_both_sides_present() {
        assert_eq!(email("ada.example.com"), Err(EmailError::MissingAt));
        assert_eq!(
            email("ada@lovelace@example.com"),
            Err(EmailError::MultipleAt)
        );
        assert_eq!(email("@example.com"), Err(EmailError::EmptyLocalPart));
        assert_eq!(email("ada@"), Err(EmailError::EmptyDomain));
    }

    #[test]
    fn rejects_a_domain_with_empty_labels() {
        for value in ["ada@example.", "ada@.com", "ada@example..com", "ada@."] {
            assert_eq!(
                email(value),
                Err(EmailError::InvalidDomain),
                "{value:?} must be rejected"
            );
        }
    }

    /// The order of the checks is the order the messages make sense in: an
    /// address with a space in it is told about the space, not about the
    /// `@` it also lacks.
    #[test]
    fn reports_the_first_rule_broken() {
        assert_eq!(email("ada lovelace"), Err(EmailError::DisallowedCharacter));
        assert_eq!(email("ada@lovelace@"), Err(EmailError::MultipleAt));
    }

    #[test]
    fn deserialising_validates() {
        let error = serde_json::from_str::<Email>("\"ada\"").unwrap_err();
        assert!(error.to_string().contains("must contain an @"), "{error}");

        let ok: Email = serde_json::from_str("\" Ada@EXAMPLE.com \"").unwrap();
        assert_eq!(ok.as_ref(), "Ada@example.com");
    }
}
