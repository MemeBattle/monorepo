//! The display name newtype: how a user-facing name is sanitised and
//! validated. How it crosses the database boundary is the repository's
//! business (`repository.rs`).

use nutype::nutype;
use unicode_general_category::GeneralCategory;
use unicode_normalization::UnicodeNormalization;

/// Upper bound on a display name, in characters. Long enough for a real name,
/// short enough to keep the sign-in UI and the authenticator prompt readable.
pub const MAX_DISPLAY_NAME_LENGTH: usize = 64;

/// Why a string is not a [`DisplayName`].
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DisplayNameError {
    #[error("must not be empty")]
    Empty,

    #[error("must be at most {MAX_DISPLAY_NAME_LENGTH} characters")]
    TooLong,

    /// A code point that must never reach a UI: controls, invisible format
    /// characters (zero-width space, bidi overrides), line and paragraph
    /// separators, surrogates, private use, unassigned. No position is
    /// reported: it could only refer to the sanitised value, which the client
    /// never sees, so it cannot map it back onto what the user typed.
    #[error("must not contain control or invisible characters")]
    DisallowedCharacter,
}

/// Unicode general category Zs: the space separators. Every one of them is
/// mapped to ASCII space, following RFC 8266's width mapping, so that trimming
/// and collapsing see a single kind of space.
fn is_space_separator(c: char) -> bool {
    const EN_QUAD_TO_HAIR_SPACE: std::ops::RangeInclusive<char> = '\u{2000}'..='\u{200a}';
    matches!(
        c,
        '\u{20}' | '\u{a0}' | '\u{1680}' | '\u{202f}' | '\u{205f}' | '\u{3000}'
    ) || EN_QUAD_TO_HAIR_SPACE.contains(&c)
}

/// Zero width joiner and non-joiner. They are the one part of category Cf a
/// display name needs: emoji ZWJ sequences (👨‍👩‍👧) and Persian/Indic
/// orthography are built from them.
const ZERO_WIDTH_JOINERS: [char; 2] = ['\u{200d}', '\u{200c}'];

fn is_zero_width_joiner(c: char) -> bool {
    ZERO_WIDTH_JOINERS.contains(&c)
}

/// Normalises a display name: every Unicode space separator becomes an ASCII
/// space, the result is put in NFC, then leading and trailing spaces are
/// removed and runs of spaces collapse to one.
///
/// NFC, not NFKC: compatibility folding would rewrite what the user typed
/// ("Ada™" → "AdaTM", "①" → "1", "x²" → "x2") for no safety gain, since the
/// characters that actually mislead are rejected outright by
/// [`validate_display_name`]. NFC still composes decomposed input, so
/// "e\u{301}" and the Hangul jamo sequence "\u{1100}\u{1161}" become their
/// precomposed forms.
fn sanitize_display_name(value: String) -> String {
    let mapped = value
        .chars()
        .map(|c| if is_space_separator(c) { ' ' } else { c })
        .nfc();

    let mut result = String::with_capacity(value.len());
    let mut pending_space = false;
    for c in mapped {
        if c == ' ' {
            // Held back so that a run of spaces, and a trailing one, never
            // reach the output.
            pending_space = !result.is_empty();
            continue;
        }
        if pending_space {
            result.push(' ');
            pending_space = false;
        }
        result.push(c);
    }
    result
}

/// Whether `c` may appear in a display name at all, ignoring the placement
/// rules for the zero width joiners.
fn is_allowed_character(c: char) -> bool {
    !matches!(
        unicode_general_category::get_general_category(c),
        GeneralCategory::Control
            | GeneralCategory::Format
            | GeneralCategory::LineSeparator
            | GeneralCategory::ParagraphSeparator
            | GeneralCategory::Surrogate
            | GeneralCategory::PrivateUse
            | GeneralCategory::Unassigned
    ) || is_zero_width_joiner(c)
}

/// Rejects anything invisible or direction-changing, then the empty and the
/// over-long. Runs on the sanitised value.
///
/// A joiner is only a joiner between two visible characters: at either end of
/// the name, next to a space or next to another joiner it is a zero width
/// character with nothing to join, which is exactly the invisible padding the
/// rest of the rule keeps out.
fn validate_display_name(value: &str) -> Result<(), DisplayNameError> {
    if value.is_empty() {
        return Err(DisplayNameError::Empty);
    }
    if value.chars().count() > MAX_DISPLAY_NAME_LENGTH {
        return Err(DisplayNameError::TooLong);
    }

    let mut previous: Option<char> = None;
    let mut characters = value.chars().peekable();
    while let Some(c) = characters.next() {
        if !is_allowed_character(c) {
            return Err(DisplayNameError::DisallowedCharacter);
        }
        if is_zero_width_joiner(c) {
            let joins = |neighbour: Option<char>| {
                neighbour.is_some_and(|n| n != ' ' && !is_zero_width_joiner(n))
            };
            if !joins(previous) || !joins(characters.peek().copied()) {
                return Err(DisplayNameError::DisallowedCharacter);
            }
        }
        previous = Some(c);
    }

    Ok(())
}

/// A user-facing name, valid by construction.
///
/// Sanitised (space mapping, NFC, trimming) and validated (no invisible or
/// unassigned characters, length cap) in house, so every UI and every
/// authenticator prompt can show it as-is: no control or invisible characters,
/// no bidi tricks, no leading or doubled spaces. Deserialising re-validates, so
/// a stored or received value is as safe as a freshly constructed one.
///
/// This deliberately does not use the PRECIS Nickname profile
/// (`precis-profiles`). That crate's 0.1.13 space trimming indexes bytes with a
/// char index, so it panics on "Ада " and swallows interior spaces in
/// "José  Silva"; it deletes non-ASCII spaces instead of mapping them to
/// U+0020; and it tests the string class before normalising, so decomposed
/// Hangul is rejected. The profile itself also rejects U+FE0F and ZWJ
/// sequences, which rules out most modern emoji — not an option for a game's
/// display name.
#[nutype(
    sanitize(with = sanitize_display_name),
    validate(with = validate_display_name, error = DisplayNameError),
    derive(Debug, Clone, PartialEq, Eq, AsRef, Deref, Display, Into, Serialize, Deserialize),
)]
pub struct DisplayName(String);

#[cfg(test)]
mod display_name_tests {
    use super::*;

    fn name(value: &str) -> Result<String, DisplayNameError> {
        DisplayName::try_new(value).map(Into::into)
    }

    #[test]
    fn keeps_an_ordinary_name() {
        for value in ["Ada Lovelace", "Ада", "Zoë", "O'Brien", "Jean-Luc", "李雷"] {
            assert_eq!(name(value), Ok(value.to_owned()));
        }
    }

    /// Emoji are made of exactly the characters a naive "no invisibles" rule
    /// throws away: U+FE0F, skin tone modifiers, the keycap combining mark and
    /// the zero width joiner.
    #[test]
    fn keeps_emoji() {
        for value in [
            "Ada 🚀",
            "Ada \u{2764}\u{fe0f}",
            "Ada 👨\u{200d}👩\u{200d}👧",
            "👍🏽 Ada",
            "1\u{fe0f}\u{20e3}",
        ] {
            assert_eq!(name(value), Ok(value.to_owned()));
        }
    }

    #[test]
    fn trims_and_collapses_spaces() {
        assert_eq!(name("  Ada   Lovelace  "), Ok("Ada Lovelace".to_owned()));
        // Non-ASCII spaces become ASCII ones and collapse with them.
        assert_eq!(name("Ada\u{a0}Lovelace"), Ok("Ada Lovelace".to_owned()));
        assert_eq!(
            name("Ada\u{3000} \u{2003}Lovelace"),
            Ok("Ada Lovelace".to_owned())
        );
        assert_eq!(name("\u{a0}Ada\u{a0}"), Ok("Ada".to_owned()));
        // Trimming works on characters, not bytes: a multi-byte name followed
        // by a space is not truncated, and interior spaces survive.
        assert_eq!(name("Ада "), Ok("Ада".to_owned()));
        assert_eq!(name("Zoë "), Ok("Zoë".to_owned()));
        assert_eq!(name("José  Silva"), Ok("José Silva".to_owned()));
    }

    /// NFC composes decomposed input but, unlike NFKC, leaves compatibility
    /// characters alone: they are what the user typed and none of them can
    /// impersonate another name.
    #[test]
    fn normalises_to_nfc() {
        assert_eq!(name("e\u{301}"), Ok("\u{e9}".to_owned()));
        // Conjoining Hangul jamo compose into the syllable 가.
        assert_eq!(name("\u{1100}\u{1161}"), Ok("\u{ac00}".to_owned()));

        for value in ["Ada™", "①", "ﬁsh", "x²"] {
            assert_eq!(name(value), Ok(value.to_owned()));
        }
    }

    #[test]
    fn rejects_empty_names() {
        assert_eq!(name(""), Err(DisplayNameError::Empty));
        assert_eq!(name("   "), Err(DisplayNameError::Empty));
        assert_eq!(name("\u{a0}"), Err(DisplayNameError::Empty));
    }

    #[test]
    fn rejects_names_over_the_limit() {
        assert!(name(&"a".repeat(MAX_DISPLAY_NAME_LENGTH)).is_ok());
        assert_eq!(
            name(&"a".repeat(MAX_DISPLAY_NAME_LENGTH + 1)),
            Err(DisplayNameError::TooLong)
        );
    }

    /// Invisible and direction-changing characters would let a name render as
    /// empty or as another name in the authenticator prompt. Surrogates are
    /// not covered: a Rust `str` cannot hold one.
    #[test]
    fn rejects_control_and_format_characters() {
        for value in [
            "Ada\u{7}",
            "\u{200b}",
            "Ada\u{200b}",
            "\u{202e}adA",
            "\u{feff}Ada",
            "\u{2028}Ada",
            "Ada\u{e000}",
        ] {
            assert_eq!(
                name(value),
                Err(DisplayNameError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }
    }

    /// A zero width joiner is only allowed where it joins two visible
    /// characters; anywhere else it is invisible padding.
    #[test]
    fn rejects_a_joiner_with_nothing_to_join() {
        for value in [
            "\u{200d}Ada",
            "Ada\u{200d}",
            "Ada\u{200d}\u{200d}Bob",
            "Ada \u{200d}Bob",
        ] {
            assert_eq!(
                name(value),
                Err(DisplayNameError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }
    }

    #[test]
    fn keeps_joiners_between_letters() {
        assert_eq!(name("Ada\u{200d}Bob"), Ok("Ada\u{200d}Bob".to_owned()));
        // ZWNJ inside Persian text: لـا written without the ligature.
        assert_eq!(
            name("\u{644}\u{200c}\u{627}"),
            Ok("\u{644}\u{200c}\u{627}".to_owned())
        );
    }

    #[test]
    fn deserialising_validates() {
        let error = serde_json::from_str::<DisplayName>("\"\"").unwrap_err();
        assert!(error.to_string().contains("must not be empty"));

        let ok: DisplayName = serde_json::from_str("\"  Ada  \"").unwrap();
        assert_eq!(ok.as_ref(), "Ada");
    }
}
