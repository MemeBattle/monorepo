//! The values an authorization code flow carries: the code CAS hands the
//! client, the PKCE challenge the client hands `/authorize`, and the
//! verifier it later proves itself with at `/token`. How any of them crosses
//! the database boundary is the repository's business (`repository.rs`).

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

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
/// exactly this long. The verifier (§4.1) has the same bounds.
const MIN_CHALLENGE_LENGTH: usize = 43;

/// The longest challenge RFC 7636 §4.2 allows, and the longest verifier.
const MAX_CHALLENGE_LENGTH: usize = 128;

/// RFC 7636 `unreserved`: `[A-Za-z0-9-._~]`, the alphabet of a challenge and
/// of a verifier alike.
fn is_unreserved(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~')
}

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
        if !value.bytes().all(is_unreserved) {
            return Err(CodeChallengeError::DisallowedCharacter);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Whether `verifier` is the one this challenge was derived from:
    /// `BASE64URL(SHA256(verifier)) == challenge`, the S256 transformation
    /// (RFC 7636 §4.6), the only one CAS accepts. Compared in constant time,
    /// like a client secret: both sides are short, but one of them is the
    /// caller's to vary, and a comparison that returns at the first
    /// difference would tell it how far it got.
    pub fn matches(&self, verifier: &CodeVerifier) -> bool {
        let transformed = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.0.as_bytes()));
        transformed.as_bytes().ct_eq(self.0.as_bytes()).into()
    }
}

/// Why a string is not a [`CodeVerifier`]. There is one answer for every
/// rule, `invalid_request`, so one variant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error(
    "must be {MIN_CHALLENGE_LENGTH} to {MAX_CHALLENGE_LENGTH} characters of ASCII letters, digits, '-', '.', '_' and '~'"
)]
pub struct CodeVerifierError;

/// A PKCE `code_verifier` (RFC 7636 §4.1): 43 to 128 characters of the
/// unreserved set, the secret whose S256 hash the client sent to
/// `/authorize`. It proves that whoever redeems a code is whoever asked for
/// it, so it is a secret for as long as the code lives: `Debug` is redacted
/// and nothing exposes it.
#[derive(Clone, PartialEq, Eq)]
pub struct CodeVerifier(String);

impl CodeVerifier {
    pub fn try_new(value: impl Into<String>) -> Result<Self, CodeVerifierError> {
        let value = value.into();
        if !(MIN_CHALLENGE_LENGTH..=MAX_CHALLENGE_LENGTH).contains(&value.len())
            || !value.bytes().all(is_unreserved)
        {
            return Err(CodeVerifierError);
        }
        Ok(Self(value))
    }
}

impl std::fmt::Debug for CodeVerifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CodeVerifier(<redacted>)")
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

    /// RFC 7636 Appendix B, both values copied from the RFC.
    const APPENDIX_B_VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const APPENDIX_B_CHALLENGE: &str = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    #[test]
    fn the_appendix_b_verifier_matches_its_challenge() {
        let challenge = CodeChallenge::try_new(APPENDIX_B_CHALLENGE).unwrap();

        assert!(challenge.matches(&CodeVerifier::try_new(APPENDIX_B_VERIFIER).unwrap()));
    }

    #[test]
    fn any_other_verifier_does_not_match() {
        let challenge = CodeChallenge::try_new(APPENDIX_B_CHALLENGE).unwrap();
        // The verifier with its last character changed, and the challenge
        // itself presented as a verifier (the `plain` method, refused).
        for verifier in [
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl",
            APPENDIX_B_CHALLENGE,
            &"a".repeat(43),
        ] {
            assert!(
                !challenge.matches(&CodeVerifier::try_new(verifier).unwrap()),
                "{verifier}"
            );
        }
    }

    #[test]
    fn a_verifier_of_43_to_128_unreserved_characters_is_accepted() {
        for value in [
            APPENDIX_B_VERIFIER.to_owned(),
            "a".repeat(43),
            "a".repeat(128),
            format!("{}-._~", "Z9".repeat(20)),
        ] {
            assert!(CodeVerifier::try_new(value.clone()).is_ok(), "{value:?}");
        }
    }

    #[test]
    fn a_verifier_outside_the_grammar_is_refused() {
        for value in [
            String::new(),
            "a".repeat(42),
            "a".repeat(129),
            format!("{}+", "a".repeat(42)),
            format!("{}/", "a".repeat(42)),
            format!("{}=", "a".repeat(42)),
            format!("{} ", "a".repeat(42)),
            format!("{}é", "a".repeat(42)),
        ] {
            assert_eq!(
                CodeVerifier::try_new(value.clone()),
                Err(CodeVerifierError),
                "{value:?}"
            );
        }
    }

    #[test]
    fn debug_never_prints_the_verifier() {
        let verifier = CodeVerifier::try_new(APPENDIX_B_VERIFIER).unwrap();

        assert_eq!(format!("{verifier:?}"), "CodeVerifier(<redacted>)");
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
