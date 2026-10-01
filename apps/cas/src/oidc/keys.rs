//! The signing key set: the ES256 keys read from `CAS_SIGNING_KEY`, their
//! public halves as JWKs, and the compact JWS the active one produces. See
//! `docs/adr/0009-signing-key-and-discovery.md`.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use openssl::bn::{BigNum, BigNumContext};
use openssl::ecdsa::EcdsaSig;
use openssl::hash::MessageDigest;
use openssl::nid::Nid;
use openssl::pkey::{PKey, Private};
use openssl::sign::Signer;
use serde::Serialize;
use sha2::{Digest, Sha256};

/// The JWS algorithm every key signs with, and the only one CAS advertises.
pub const SIGNING_ALGORITHM: &str = "ES256";

/// P-256 coordinates and ECDSA scalars are 32 bytes (JWA §3.4, RFC 7518
/// §6.2.1.2).
const P256_FIELD_BYTES: i32 = 32;

/// Why `CAS_SIGNING_KEY` cannot be used. Every variant names the 1-based
/// position of the offending PEM block and nothing else: the `Display` text
/// is what startup prints, and OpenSSL's own messages are not forwarded
/// because they can quote their input.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SigningKeyError {
    #[error("no PEM block found")]
    NoKey,

    #[error(
        "PEM block {index} is malformed (a BEGIN line without its matching END line, or the other way round)"
    )]
    MalformedBlock { index: usize },

    #[error("PEM block {index} is encrypted; the key must be stored unencrypted")]
    Encrypted { index: usize },

    #[error("PEM block {index} is not a private key")]
    NotAPrivateKey { index: usize },

    #[error("PEM block {index} is not an EC key on the P-256 curve")]
    NotEcP256 { index: usize },

    #[error("PEM block {index} is inconsistent: its public key does not match its private key")]
    Inconsistent { index: usize },
}

/// The public half of a signing key, as `/jwks.json` publishes it
/// (RFC 7517, RFC 7518 §6.2.1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PublicJwk {
    pub kty: &'static str,
    pub crv: &'static str,
    pub x: String,
    pub y: String,
    pub kid: String,
    #[serde(rename = "use")]
    pub use_: &'static str,
    pub alg: &'static str,
}

/// A JWK Set: the body of `/jwks.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Jwks {
    pub keys: Vec<PublicJwk>,
}

/// One validated P-256 private key. `Debug` prints the `kid` only.
#[derive(Clone)]
pub struct SigningKey {
    kid: String,
    pkey: PKey<Private>,
    jwk: PublicJwk,
}

impl std::fmt::Debug for SigningKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SigningKey")
            .field("kid", &self.kid)
            .finish_non_exhaustive()
    }
}

impl SigningKey {
    /// The RFC 7638 thumbprint of the public key.
    pub fn kid(&self) -> &str {
        &self.kid
    }

    pub fn jwk(&self) -> &PublicJwk {
        &self.jwk
    }

    /// A compact JWS (RFC 7515 §3.1) over `payload`, with the header
    /// `{"alg":"ES256","typ":<typ>,"kid":<kid>}`. `typ` is the caller's:
    /// `at+jwt` for an RFC 9068 access token, `JWT` for an ID token.
    ///
    /// The key was validated when it was read, so the OpenSSL calls below
    /// fail only if OpenSSL itself is broken; they panic rather than make
    /// every caller handle an error that cannot happen.
    pub fn sign(&self, typ: &str, payload: &[u8]) -> String {
        let header = serde_json::json!({
            "alg": SIGNING_ALGORITHM,
            "typ": typ,
            "kid": self.kid,
        });
        let signing_input = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(header.to_string()),
            URL_SAFE_NO_PAD.encode(payload)
        );

        let mut signer = Signer::new(MessageDigest::sha256(), &self.pkey)
            .expect("a validated P-256 key can create a signer");
        let der = signer
            .sign_oneshot_to_vec(signing_input.as_bytes())
            .expect("a validated P-256 key can sign");

        // OpenSSL returns the DER `ECDSA-Sig-Value`; JWS wants `r || s`, each
        // left-padded to the field size (JWA §3.4).
        let signature = EcdsaSig::from_der(&der).expect("OpenSSL produced a DER ECDSA signature");
        let mut raw = signature
            .r()
            .to_vec_padded(P256_FIELD_BYTES)
            .expect("r fits the P-256 field");
        raw.extend(
            signature
                .s()
                .to_vec_padded(P256_FIELD_BYTES)
                .expect("s fits the P-256 field"),
        );

        format!("{signing_input}.{}", URL_SAFE_NO_PAD.encode(raw))
    }
}

/// Every key `CAS_SIGNING_KEY` holds, in order: the first signs, all are
/// published, which is how a rotation is carried out (ADR 0009 (d)).
#[derive(Debug, Clone)]
pub struct SigningKeys {
    active: SigningKey,
    published: Vec<PublicJwk>,
}

impl SigningKeys {
    /// Reads one or more concatenated PEM private-key blocks, PKCS#8
    /// (`BEGIN PRIVATE KEY`) or SEC1 (`BEGIN EC PRIVATE KEY`). Text outside
    /// the blocks is ignored, as PEM allows; malformed framing is not,
    /// because a skipped block would be a rotation key that never gets
    /// published.
    pub fn from_pem(pem: &str) -> Result<Self, SigningKeyError> {
        let blocks = pem_blocks(pem)?;

        let mut keys = blocks
            .iter()
            .enumerate()
            .map(|(position, block)| read_key(position + 1, block))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter();

        let active = keys.next().ok_or(SigningKeyError::NoKey)?;
        let published = std::iter::once(active.jwk.clone())
            .chain(keys.map(|key| key.jwk))
            .collect();

        Ok(Self { active, published })
    }

    /// The key that signs.
    pub fn active(&self) -> &SigningKey {
        &self.active
    }

    /// The public key of every block, in order, the active one first.
    pub fn published(&self) -> &[PublicJwk] {
        &self.published
    }

    pub fn jwks(&self) -> Jwks {
        Jwks {
            keys: self.published.clone(),
        }
    }
}

/// A PEM block as found in the input: its label and the text from its
/// `BEGIN` line through its `END` line.
#[derive(Debug, PartialEq, Eq)]
struct PemBlock<'a> {
    label: &'a str,
    text: &'a str,
}

fn boundary<'a>(line: &'a str, kind: &str) -> Option<&'a str> {
    line.strip_prefix("-----")?
        .strip_prefix(kind)?
        .strip_prefix(' ')?
        .strip_suffix("-----")
}

/// Splits `input` into its PEM blocks, strictly: a `BEGIN` inside an open
/// block, an `END` with no open block or with another label, and a block
/// still open at the end of the input are all `MalformedBlock`, naming the
/// block they break.
fn pem_blocks(input: &str) -> Result<Vec<PemBlock<'_>>, SigningKeyError> {
    let mut blocks = Vec::new();
    let mut open: Option<(&str, usize)> = None;
    let mut offset = 0;

    for raw_line in input.split_inclusive('\n') {
        let start = offset;
        offset += raw_line.len();
        let line = raw_line.trim_end();

        if let Some(label) = boundary(line, "BEGIN") {
            if open.is_some() {
                return Err(SigningKeyError::MalformedBlock {
                    index: blocks.len() + 1,
                });
            }
            open = Some((label, start));
        } else if let Some(label) = boundary(line, "END") {
            match open.take() {
                Some((open_label, open_start)) if open_label == label => {
                    blocks.push(PemBlock {
                        label,
                        text: &input[open_start..offset],
                    });
                }
                _ => {
                    return Err(SigningKeyError::MalformedBlock {
                        index: blocks.len() + 1,
                    });
                }
            }
        }
    }

    if open.is_some() {
        return Err(SigningKeyError::MalformedBlock {
            index: blocks.len() + 1,
        });
    }
    if blocks.is_empty() {
        return Err(SigningKeyError::NoKey);
    }
    Ok(blocks)
}

fn read_key(index: usize, block: &PemBlock<'_>) -> Result<SigningKey, SigningKeyError> {
    // Encrypted PKCS#8 announces itself in the label, encrypted SEC1 in a
    // `Proc-Type` header. Both are refused before OpenSSL sees them.
    let encrypted_header = block
        .text
        .lines()
        .any(|line| line.starts_with("Proc-Type:") && line.contains("ENCRYPTED"));
    if block.label == "ENCRYPTED PRIVATE KEY" || encrypted_header {
        return Err(SigningKeyError::Encrypted { index });
    }

    // Never `private_key_from_pem`: it installs OpenSSL's default passphrase
    // callback, which prompts on the terminal for an encrypted key instead
    // of failing. This callback supplies no passphrase, so any encrypted
    // form the checks above missed fails here.
    let pkey = PKey::private_key_from_pem_callback(block.text.as_bytes(), |_| Ok(0))
        .map_err(|_| SigningKeyError::NotAPrivateKey { index })?;

    let ec_key = pkey
        .ec_key()
        .map_err(|_| SigningKeyError::NotEcP256 { index })?;
    let group = ec_key.group();
    if group.curve_name() != Some(Nid::X9_62_PRIME256V1) {
        return Err(SigningKeyError::NotEcP256 { index });
    }

    // Parsing does not prove that the public point is `d·G`: a key whose
    // private scalar was altered still parses, and CAS would publish a JWK
    // that cannot verify its own signatures.
    ec_key
        .check_key()
        .map_err(|_| SigningKeyError::Inconsistent { index })?;

    let (x, y) = affine_coordinates(&ec_key).ok_or(SigningKeyError::Inconsistent { index })?;
    let kid = thumbprint(&x, &y);
    let jwk = PublicJwk {
        kty: "EC",
        crv: "P-256",
        x,
        y,
        kid: kid.clone(),
        use_: "sig",
        alg: SIGNING_ALGORITHM,
    };

    Ok(SigningKey { kid, pkey, jwk })
}

/// The public point's coordinates, each 32 bytes, base64url without padding.
fn affine_coordinates(ec_key: &openssl::ec::EcKey<Private>) -> Option<(String, String)> {
    let mut ctx = BigNumContext::new().ok()?;
    let mut x = BigNum::new().ok()?;
    let mut y = BigNum::new().ok()?;
    ec_key
        .public_key()
        .affine_coordinates(ec_key.group(), &mut x, &mut y, &mut ctx)
        .ok()?;
    Some((
        URL_SAFE_NO_PAD.encode(x.to_vec_padded(P256_FIELD_BYTES).ok()?),
        URL_SAFE_NO_PAD.encode(y.to_vec_padded(P256_FIELD_BYTES).ok()?),
    ))
}

/// RFC 7638: SHA-256 over the required members in lexicographic order, no
/// whitespace, base64url without padding. Derived from the key, so every
/// replica publishes the same `kid` for the same key.
fn thumbprint(x: &str, y: &str) -> String {
    let canonical = format!(r#"{{"crv":"P-256","kty":"EC","x":"{x}","y":"{y}"}}"#);
    URL_SAFE_NO_PAD.encode(Sha256::digest(canonical.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{DEV_SIGNING_KEY as DEV_KEY, DEV_SIGNING_KEY_KID as DEV_KEY_KID};
    use openssl::ec::{EcGroup, EcKey};
    use openssl::rsa::Rsa;
    use openssl::sign::Verifier;
    use openssl::symm::Cipher;

    fn p256() -> EcGroup {
        EcGroup::from_curve_name(Nid::X9_62_PRIME256V1).unwrap()
    }

    fn fresh_p256_pem() -> String {
        let key = PKey::from_ec_key(EcKey::generate(&p256()).unwrap()).unwrap();
        String::from_utf8(key.private_key_to_pem_pkcs8().unwrap()).unwrap()
    }

    fn dev_ec_key() -> EcKey<Private> {
        PKey::private_key_from_pem(DEV_KEY.as_bytes())
            .unwrap()
            .ec_key()
            .unwrap()
    }

    /// The dev key with its private scalar moved by one and its public point
    /// left alone: it parses, and it is not a key pair.
    fn tampered_pem() -> String {
        let key = dev_ec_key();
        let mut d = BigNum::new().unwrap();
        d.checked_add(key.private_key(), &BigNum::from_u32(1).unwrap())
            .unwrap();
        let tampered = EcKey::from_private_components(&p256(), &d, key.public_key()).unwrap();
        String::from_utf8(tampered.private_key_to_pem().unwrap()).unwrap()
    }

    fn rsa_pem() -> String {
        let key = PKey::from_rsa(Rsa::generate(2048).unwrap()).unwrap();
        String::from_utf8(key.private_key_to_pem_pkcs8().unwrap()).unwrap()
    }

    fn p384_pem() -> String {
        let group = EcGroup::from_curve_name(Nid::SECP384R1).unwrap();
        let key = PKey::from_ec_key(EcKey::generate(&group).unwrap()).unwrap();
        String::from_utf8(key.private_key_to_pem_pkcs8().unwrap()).unwrap()
    }

    /// Encrypted PKCS#8, as `openssl pkcs8 -topk8 -v2 aes-256-cbc` writes it.
    fn encrypted_pkcs8_pem() -> String {
        let key = PKey::from_ec_key(dev_ec_key()).unwrap();
        String::from_utf8(
            key.private_key_to_pem_pkcs8_passphrase(Cipher::aes_256_cbc(), b"x")
                .unwrap(),
        )
        .unwrap()
    }

    /// Encrypted SEC1: a `Proc-Type: 4,ENCRYPTED` header in an
    /// `EC PRIVATE KEY` block.
    fn encrypted_sec1_pem() -> String {
        String::from_utf8(
            dev_ec_key()
                .private_key_to_pem_passphrase(Cipher::aes_128_cbc(), b"x")
                .unwrap(),
        )
        .unwrap()
    }

    fn error(pem: &str) -> SigningKeyError {
        SigningKeys::from_pem(pem).unwrap_err()
    }

    #[test]
    fn the_dev_key_parses_with_its_known_thumbprint() {
        let keys = SigningKeys::from_pem(DEV_KEY).unwrap();

        assert_eq!(keys.active().kid(), DEV_KEY_KID);
        assert_eq!(keys.published().len(), 1);
        assert_eq!(keys.published()[0].kid, DEV_KEY_KID);
    }

    #[test]
    fn a_sec1_key_parses() {
        let sec1 = String::from_utf8(dev_ec_key().private_key_to_pem().unwrap()).unwrap();
        assert!(sec1.starts_with("-----BEGIN EC PRIVATE KEY-----"));

        let keys = SigningKeys::from_pem(&sec1).unwrap();
        assert_eq!(keys.active().kid(), DEV_KEY_KID);
    }

    #[test]
    fn the_first_of_several_keys_signs_and_all_are_published_in_order() {
        let second = fresh_p256_pem();
        let keys = SigningKeys::from_pem(&format!("{DEV_KEY}{second}")).unwrap();

        assert_eq!(keys.active().kid(), DEV_KEY_KID);
        let published = keys.published();
        assert_eq!(published.len(), 2);
        assert_eq!(published[0].kid, DEV_KEY_KID);
        assert_eq!(
            published[1].kid,
            SigningKeys::from_pem(&second).unwrap().active().kid()
        );
        assert_ne!(published[0].kid, published[1].kid);
        assert_eq!(keys.jwks().keys, published);
    }

    #[test]
    fn the_jwk_has_the_members_a_verifier_needs() {
        let keys = SigningKeys::from_pem(DEV_KEY).unwrap();
        let jwk = serde_json::to_value(keys.active().jwk()).unwrap();

        assert_eq!(jwk["kty"], "EC");
        assert_eq!(jwk["crv"], "P-256");
        assert_eq!(jwk["use"], "sig");
        assert_eq!(jwk["alg"], "ES256");
        assert_eq!(jwk["kid"], DEV_KEY_KID);
        assert_eq!(jwk["x"].as_str().unwrap().len(), 43);
        assert_eq!(jwk["y"].as_str().unwrap().len(), 43);
        assert_eq!(jwk.as_object().unwrap().len(), 7);
    }

    #[test]
    fn no_block_is_no_key() {
        assert_eq!(error(""), SigningKeyError::NoKey);
        assert_eq!(error("definitely not a key"), SigningKeyError::NoKey);
    }

    #[test]
    fn a_block_that_is_not_a_key_is_refused() {
        let pem = "-----BEGIN PRIVATE KEY-----\ngarbage\n-----END PRIVATE KEY-----\n";
        assert_eq!(error(pem), SigningKeyError::NotAPrivateKey { index: 1 });
    }

    #[test]
    fn a_key_that_is_not_p256_is_refused_with_its_position() {
        assert_eq!(error(&rsa_pem()), SigningKeyError::NotEcP256 { index: 1 });
        assert_eq!(
            error(&format!("{DEV_KEY}{}", rsa_pem())),
            SigningKeyError::NotEcP256 { index: 2 }
        );
        assert_eq!(
            error(&format!("{DEV_KEY}{}", p384_pem())),
            SigningKeyError::NotEcP256 { index: 2 }
        );
    }

    /// Refused up front, and promptly: a passphrase prompt would hang the
    /// test instead of failing it.
    #[test]
    fn an_encrypted_key_is_refused_without_a_prompt() {
        assert_eq!(
            error(&encrypted_pkcs8_pem()),
            SigningKeyError::Encrypted { index: 1 }
        );
        assert_eq!(
            error(&format!("{DEV_KEY}{}", encrypted_sec1_pem())),
            SigningKeyError::Encrypted { index: 2 }
        );
    }

    #[test]
    fn malformed_framing_is_refused_not_skipped() {
        assert_eq!(
            error(&format!("-----BEGIN PRIVATE KEY-----\nAAAA\n{DEV_KEY}")),
            SigningKeyError::MalformedBlock { index: 1 }
        );
        assert_eq!(
            error(&format!("{DEV_KEY}-----END PRIVATE KEY-----\n")),
            SigningKeyError::MalformedBlock { index: 2 }
        );
        assert_eq!(
            error("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----\n"),
            SigningKeyError::MalformedBlock { index: 1 }
        );
        assert_eq!(
            error("-----BEGIN PRIVATE KEY-----\nAAAA\n"),
            SigningKeyError::MalformedBlock { index: 1 }
        );
    }

    #[test]
    fn an_inconsistent_key_is_refused_with_its_position() {
        let tampered = tampered_pem();

        assert_eq!(error(&tampered), SigningKeyError::Inconsistent { index: 1 });
        assert_eq!(
            error(&format!("{DEV_KEY}{tampered}")),
            SigningKeyError::Inconsistent { index: 2 }
        );
    }

    /// Whatever the refusal, the message startup prints quotes nothing of
    /// the input.
    #[test]
    fn no_error_message_quotes_key_material() {
        let tampered = tampered_pem();
        let inputs = [
            "-----BEGIN PRIVATE KEY-----\nZ2FyYmFnZWdhcmJhZ2VnYXJiYWdl\n-----END PRIVATE KEY-----\n"
                .to_string(),
            rsa_pem(),
            p384_pem(),
            encrypted_pkcs8_pem(),
            encrypted_sec1_pem(),
            tampered.clone(),
            format!("-----BEGIN PRIVATE KEY-----\nAAAA\n{DEV_KEY}"),
            "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg".to_string(),
        ];

        for input in inputs {
            let message = error(&input).to_string();
            for line in input.lines() {
                if line.len() >= 16 && !line.starts_with("-----") {
                    assert!(
                        !message.contains(line),
                        "{message:?} quotes the input line {line:?}"
                    );
                }
            }
            assert!(!message.contains("MII"), "{message:?}");
        }
    }

    #[test]
    fn debug_of_a_key_prints_the_kid_only() {
        let keys = SigningKeys::from_pem(DEV_KEY).unwrap();
        let debug = format!("{:?}", keys.active());

        assert!(debug.contains(DEV_KEY_KID), "{debug}");
        assert!(!debug.contains("PRIVATE"), "{debug}");
        assert!(!debug.contains(&keys.active().jwk().x), "{debug}");
    }

    #[test]
    fn a_signature_is_a_compact_jws_that_openssl_verifies() {
        let keys = SigningKeys::from_pem(DEV_KEY).unwrap();
        let jws = keys.active().sign("at+jwt", br#"{"sub":"ada"}"#);

        let segments: Vec<&str> = jws.split('.').collect();
        assert_eq!(segments.len(), 3);
        assert!(segments.iter().all(|segment| !segment.is_empty()));

        let header: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(segments[0]).unwrap()).unwrap();
        assert_eq!(header["alg"], "ES256");
        assert_eq!(header["typ"], "at+jwt");
        assert_eq!(header["kid"], DEV_KEY_KID);
        assert_eq!(
            URL_SAFE_NO_PAD.decode(segments[1]).unwrap(),
            br#"{"sub":"ada"}"#
        );

        let raw = URL_SAFE_NO_PAD.decode(segments[2]).unwrap();
        assert_eq!(raw.len(), 64);

        // The raw `r || s` goes back to DER, and OpenSSL verifies it with
        // the public key alone.
        let der = EcdsaSig::from_private_components(
            BigNum::from_slice(&raw[..32]).unwrap(),
            BigNum::from_slice(&raw[32..]).unwrap(),
        )
        .unwrap()
        .to_der()
        .unwrap();
        let public = EcKey::from_public_key(&p256(), dev_ec_key().public_key()).unwrap();
        let public = PKey::from_ec_key(public).unwrap();
        let signing_input = format!("{}.{}", segments[0], segments[1]);
        let mut verifier = Verifier::new(MessageDigest::sha256(), &public).unwrap();
        assert!(
            verifier
                .verify_oneshot(&der, signing_input.as_bytes())
                .unwrap()
        );
    }

    #[test]
    fn pem_blocks_keep_the_text_between_and_including_the_boundaries() {
        let input = "prologue\n-----BEGIN A-----\nAAAA\n-----END A-----\nbetween\n-----BEGIN B-----\n-----END B-----";

        assert_eq!(
            pem_blocks(input).unwrap(),
            vec![
                PemBlock {
                    label: "A",
                    text: "-----BEGIN A-----\nAAAA\n-----END A-----\n",
                },
                PemBlock {
                    label: "B",
                    text: "-----BEGIN B-----\n-----END B-----",
                },
            ]
        );
    }
}
