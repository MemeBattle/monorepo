//! A label: a short user-facing string that a UI shows as-is — an account's
//! display name, a passkey's name. What is done to it before it is accepted
//! (space mapping, NFC, trimming) and what is refused (invisible and
//! direction-changing characters, the empty, the over-long), so that a list,
//! a sign-in screen or an authenticator prompt can render it without
//! surprises. The newtypes that use these rules live with their contexts and
//! carry their own error types; this module only knows about text.
//!
//! This deliberately does not use the PRECIS Nickname profile
//! (`precis-profiles`). That crate's 0.1.13 space trimming indexes bytes with a
//! char index, so it panics on "Ада " and swallows interior spaces in
//! "José  Silva"; it deletes non-ASCII spaces instead of mapping them to
//! U+0020; and it tests the string class before normalising, so decomposed
//! Hangul is rejected. The profile itself also rejects U+FE0F and ZWJ
//! sequences, which rules out most modern emoji — not an option for a game's
//! display name.

use icu_properties::{
    CodePointSetData,
    props::{DefaultIgnorableCodePoint, VariationSelector},
};
use unicode_general_category::GeneralCategory;
use unicode_normalization::UnicodeNormalization;

/// Upper bound on a label, in characters. Long enough for a real name or a
/// device's name, short enough to keep a list, the sign-in UI and the
/// authenticator prompt readable.
pub const MAX_LABEL_LENGTH: usize = 64;

/// Why a string is not a valid label.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LabelError {
    #[error("must not be empty")]
    Empty,

    #[error("must be at most {MAX_LABEL_LENGTH} characters")]
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
/// label needs: emoji ZWJ sequences (👨‍👩‍👧) and Persian/Indic
/// orthography are built from them.
const ZERO_WIDTH_JOINERS: [char; 2] = ['\u{200d}', '\u{200c}'];

fn is_zero_width_joiner(c: char) -> bool {
    ZERO_WIDTH_JOINERS.contains(&c)
}

/// Normalises a label: every Unicode space separator becomes an ASCII
/// space, the result is put in NFC, then leading and trailing spaces are
/// removed and runs of spaces collapse to one.
///
/// NFC, not NFKC: compatibility folding would rewrite what the user typed
/// ("Ada™" → "AdaTM", "①" → "1", "x²" → "x2") for no safety gain, since the
/// characters that actually mislead are rejected outright by
/// [`validate_label`]. NFC still composes decomposed input, so
/// "e\u{301}" and the Hangul jamo sequence "\u{1100}\u{1161}" become their
/// precomposed forms.
pub fn sanitize_label(value: String) -> String {
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

fn is_variation_selector(c: char) -> bool {
    CodePointSetData::new::<VariationSelector>().contains(c)
}

fn is_combining_mark(c: char) -> bool {
    matches!(
        unicode_general_category::get_general_category(c),
        GeneralCategory::NonspacingMark
            | GeneralCategory::SpacingMark
            | GeneralCategory::EnclosingMark
    )
}

/// A base for combining marks and selectors, or the right side of a joiner.
/// Unicode properties describe characters, not font-specific glyph coverage.
fn is_visible_base(c: char) -> bool {
    is_allowed_character(c)
        && c != ' '
        && !is_combining_mark(c)
        && !CodePointSetData::new::<DefaultIgnorableCodePoint>().contains(c)
}

/// General categories alone miss invisibles such as CGJ and Hangul fillers.
/// Use Unicode's Default_Ignorable_Code_Point property as well, with contextual
/// exceptions for joiners and variation selectors below.
fn is_allowed_character(c: char) -> bool {
    if is_zero_width_joiner(c) || is_variation_selector(c) {
        return true;
    }
    // Braille Pattern Blank has no dots, but is a symbol rather than a space
    // or default-ignorable character in Unicode.
    c != '\u{2800}'
        && !CodePointSetData::new::<DefaultIgnorableCodePoint>().contains(c)
        && !matches!(
            unicode_general_category::get_general_category(c),
            GeneralCategory::Control
                | GeneralCategory::Format
                | GeneralCategory::LineSeparator
                | GeneralCategory::ParagraphSeparator
                | GeneralCategory::Surrogate
                | GeneralCategory::PrivateUse
                | GeneralCategory::Unassigned
        )
}

/// Rejects anything invisible or direction-changing, then the empty and the
/// over-long. Runs on the sanitised value.
///
/// Marks need a preceding base, selectors must immediately follow a base, and
/// joiners need a base on both sides. A mark or selector may precede a joiner
/// (as in emoji and Indic text), but cannot supply the base itself.
pub fn validate_label(value: &str) -> Result<(), LabelError> {
    if value.is_empty() {
        return Err(LabelError::Empty);
    }
    if value.chars().count() > MAX_LABEL_LENGTH {
        return Err(LabelError::TooLong);
    }

    let mut previous: Option<char> = None;
    let mut has_base = false;
    let mut characters = value.chars().peekable();
    while let Some(c) = characters.next() {
        if !is_allowed_character(c) {
            return Err(LabelError::DisallowedCharacter);
        }
        if c == ' ' {
            has_base = false;
        } else if is_variation_selector(c) {
            if !previous.is_some_and(is_visible_base) {
                return Err(LabelError::DisallowedCharacter);
            }
        } else if is_zero_width_joiner(c) {
            if !has_base || !characters.peek().copied().is_some_and(is_visible_base) {
                return Err(LabelError::DisallowedCharacter);
            }
            has_base = false;
        } else if is_combining_mark(c) {
            if !has_base {
                return Err(LabelError::DisallowedCharacter);
            }
        } else {
            has_base = true;
        }
        previous = Some(c);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The rules the way a newtype applies them: sanitise, then validate.
    fn name(value: &str) -> Result<String, LabelError> {
        let value = sanitize_label(value.to_owned());
        validate_label(&value).map(|()| value)
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
            "👩\u{200d}❤️\u{200d}👩",
            "🏳\u{fe0f}\u{200d}🌈",
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
        assert_eq!(name(""), Err(LabelError::Empty));
        assert_eq!(name("   "), Err(LabelError::Empty));
        assert_eq!(name("\u{a0}"), Err(LabelError::Empty));
    }

    #[test]
    fn rejects_names_over_the_limit() {
        assert!(name(&"a".repeat(MAX_LABEL_LENGTH)).is_ok());
        assert_eq!(
            name(&"a".repeat(MAX_LABEL_LENGTH + 1)),
            Err(LabelError::TooLong)
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
                Err(LabelError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }
    }

    #[test]
    fn rejects_invisibles_outside_the_format_category() {
        for invisible in [
            '\u{034f}', '\u{115f}', '\u{1160}', '\u{17b4}', '\u{17b5}', '\u{2800}', '\u{3164}',
            '\u{ffa0}',
        ] {
            for value in [
                invisible.to_string(),
                format!("Ada{invisible}"),
                format!("A{invisible}B"),
            ] {
                assert_eq!(
                    name(&value),
                    Err(LabelError::DisallowedCharacter),
                    "{value:?} must be rejected"
                );
            }
        }
    }

    #[test]
    fn rejects_selectors_and_marks_without_a_base() {
        for value in [
            "\u{fe0f}",
            "\u{e0100}",
            "\u{180b}",
            "\u{fe0f}Ada",
            "Ada \u{fe0f}",
            "A\u{fe0f}\u{fe0f}",
            "\u{301}",
            "Ada \u{301}",
            "\u{fe0f}\u{200d}\u{fe0f}",
            "A\u{200d}\u{fe0f}",
            "A\u{200d}\u{301}B",
        ] {
            assert_eq!(
                name(value),
                Err(LabelError::DisallowedCharacter),
                "{value:?} must be rejected"
            );
        }
    }

    #[test]
    fn keeps_marks_and_selectors_with_a_base() {
        for value in [
            "q\u{301}\u{302}",
            "\u{4e00}\u{e0100}",
            "\u{1820}\u{180b}",
            "\u{915}\u{94d}\u{200d}\u{937}",
        ] {
            assert_eq!(name(value), Ok(value.to_owned()));
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
                Err(LabelError::DisallowedCharacter),
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
}
