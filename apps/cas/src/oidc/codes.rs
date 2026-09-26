//! The two values an authorization code flow carries through `/authorize`:
//! the code CAS hands the client, and the PKCE challenge the client hands
//! CAS. How either crosses the database boundary is the repository's
//! business (`repository.rs`).

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};

/// Bytes of entropy in a code. 256 bits, as a session token: not guessable
/// within the minute a code lives, nor in any other span of time.
const CODE_BYTES: usize = 32;

/// An authorization code: the base64url form of [`CODE_BYTES`] random
/// bytes. Never logged, never stored; only its [`hash`](Self::hash) reaches
/// the database. `Debug` is redacted for the same reason.
#[derive(Clone, PartialEq, Eq)]
pub struct AuthorizationCode(String);

impl AuthorizationCode {
    /// Draws a fresh code from the operating system's random source. The
    /// only failure is the OS refusing to provide randomness.
    pub fn generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; CODE_BYTES];
        getrandom::fill(&mut bytes)?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// Accepts a presented value only if it has the shape of a code this
    /// service issued, so junk is refused before it costs a query (#743).
    pub fn parse(value: &str) -> Option<Self> {
        let bytes = URL_SAFE_NO_PAD.decode(value).ok()?;
        (bytes.len() == CODE_BYTES).then(|| Self(value.to_owned()))
    }

    /// What the database stores and looks up.
    pub fn hash(&self) -> CodeHash {
        CodeHash(Sha256::digest(self.0.as_bytes()).to_vec())
    }

    /// The value to put in the redirect. Named so that every use of the
    /// secret is visible at the call site.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for AuthorizationCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AuthorizationCode(<redacted>)")
    }
}

/// SHA-256 of an [`AuthorizationCode`]. Safe to store and to log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeHash(Vec<u8>);

impl CodeHash {
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

/// The shortest challenge RFC 7636 §4.2 allows; an S256 challenge is always
/// exactly this long.
const MIN_CHALLENGE_LENGTH: usize = 43;

/// The longest challenge RFC 7636 §4.2 allows.
const MAX_CHALLENGE_LENGTH: usize = 128;

/// Why a string is not a [`CodeChallenge`]: one variant per rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CodeChallengeError {
    #[error("must be {MIN_CHALLENGE_LENGTH} to {MAX_CHALLENGE_LENGTH} characters")]
    Length,

    #[error("must contain only ASCII letters, digits, '-', '.', '_' and '~'")]
    DisallowedCharacter,
}

/// A PKCE `code_challenge` (RFC 7636 §4.2): 43 to 128 characters of the
/// unreserved set `[A-Za-z0-9-._~]`. Stored as sent; `/token` (#743)
/// compares it with the transformed verifier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeChallenge(String);

impl CodeChallenge {
    pub fn try_new(value: impl Into<String>) -> Result<Self, CodeChallengeError> {
        let value = value.into();
        if !(MIN_CHALLENGE_LENGTH..=MAX_CHALLENGE_LENGTH).contains(&value.len()) {
            return Err(CodeChallengeError::Length);
        }
        if !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~'))
        {
            return Err(CodeChallengeError::DisallowedCharacter);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generated_code_is_43_base64url_characters_and_parses_back() {
        let code = AuthorizationCode::generate().unwrap();

        assert_eq!(code.expose().len(), 43, "32 bytes of base64url, unpadded");
        assert!(
            code.expose()
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')),
            "base64url alphabet only"
        );
        assert_eq!(AuthorizationCode::parse(code.expose()), Some(code));
    }

    #[test]
    fn two_codes_differ() {
        let first = AuthorizationCode::generate().unwrap();
        let second = AuthorizationCode::generate().unwrap();

        assert_ne!(first, second);
        assert_ne!(first.hash(), second.hash());
    }

    #[test]
    fn parse_refuses_anything_but_a_code() {
        let code = AuthorizationCode::generate().unwrap();
        let padded = format!("{}=", code.expose());
        for value in [
            "",
            "short",
            // 43 characters, but the last one carries bits past the 32nd
            // byte, which the strict decoder refuses.
            &"a".repeat(43),
            &"a".repeat(44),
            &padded,
            "not base64url!!",
            &"A".repeat(42),
            &code
                .expose()
                .replace(|c: char| c.is_ascii_alphabetic(), "+"),
        ] {
            assert!(
                AuthorizationCode::parse(value).is_none(),
                "{value:?} must not parse"
            );
        }
    }

    /// Known answer: the SHA-256 of the ASCII string, computed outside the
    /// code under test (`printf %s AAAA... | shasum -a 256`).
    #[test]
    fn the_hash_is_sha256_of_the_code() {
        let code = AuthorizationCode::parse("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").unwrap();

        let hex: String = code
            .hash()
            .as_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();

        assert_eq!(
            hex,
            "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a"
        );
    }

    #[test]
    fn debug_never_prints_the_code() {
        let code = AuthorizationCode::generate().unwrap();

        let debug = format!("{code:?}");

        assert_eq!(debug, "AuthorizationCode(<redacted>)");
        assert!(!debug.contains(code.expose()));
    }

    #[test]
    fn a_challenge_of_43_to_128_unreserved_characters_is_accepted() {
        for value in [
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM".to_owned(),
            "a".repeat(43),
            "a".repeat(128),
            format!("{}-._~", "a".repeat(39)),
        ] {
            assert_eq!(
                CodeChallenge::try_new(value.clone()).map(|c| c.as_str().to_owned()),
                Ok(value.clone()),
                "{value:?}"
            );
        }
    }

    #[test]
    fn a_challenge_outside_the_grammar_is_refused() {
        assert_eq!(
            CodeChallenge::try_new("a".repeat(42)),
            Err(CodeChallengeError::Length)
        );
        assert_eq!(
            CodeChallenge::try_new("a".repeat(129)),
            Err(CodeChallengeError::Length)
        );
        assert_eq!(CodeChallenge::try_new(""), Err(CodeChallengeError::Length));
        for bad in ['+', '/', '=', ' '] {
            let value = format!("{}{bad}", "a".repeat(42));
            assert_eq!(
                CodeChallenge::try_new(value.clone()),
                Err(CodeChallengeError::DisallowedCharacter),
                "{value:?}"
            );
        }
    }
}
