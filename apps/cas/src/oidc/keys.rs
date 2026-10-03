//! The signing key set: the ES256 keys read from `CAS_SIGNING_KEY`, their
//! public halves as JWKs, the compact JWS the active one produces, and the
//! strict verification of a JWS CAS itself issued. See
//! `docs/adr/0009-signing-key-and-discovery.md` and
//! `docs/adr/0013-userinfo-and-rp-initiated-logout.md`.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use openssl::bn::{BigNum, BigNumContext};
use openssl::ec::EcKey;
use openssl::ecdsa::EcdsaSig;
use openssl::hash::MessageDigest;
use openssl::nid::Nid;
use openssl::pkey::{PKey, Private, Public};
use openssl::sign::{Signer, Verifier};
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
    /// The public half, for [`VerifyingKeys`]; derived once when the key is
    /// read, so the PEM is never parsed twice.
    public: PKey<Public>,
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
    verifying: VerifyingKeys,
}

impl SigningKeys {
    /// Reads one or more concatenated PEM private-key blocks, PKCS#8
    /// (`BEGIN PRIVATE KEY`) or SEC1 (`BEGIN EC PRIVATE KEY`). Text outside
    /// the blocks is ignored, as PEM allows; malformed framing is not,
    /// because a skipped block would be a rotation key that never gets
    /// published.
    pub fn from_pem(pem: &str) -> Result<Self, SigningKeyError> {
        let blocks = pem_blocks(pem)?;

        let keys = blocks
            .iter()
            .enumerate()
            .map(|(position, block)| read_key(position + 1, block))
            .collect::<Result<Vec<_>, _>>()?;

        let published = keys.iter().map(|key| key.jwk.clone()).collect();
        let verifying = VerifyingKeys {
            keys: keys
                .iter()
                .map(|key| (key.kid.clone(), key.public.clone()))
                .collect(),
        };
        let active = keys.into_iter().next().ok_or(SigningKeyError::NoKey)?;

        Ok(Self {
            active,
            published,
            verifying,
        })
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

    /// The public halves of every published key, for CAS to verify the
    /// tokens it issued: a token signed by a key that is still published
    /// verifies, so a rotation does not invalidate what the old key signed
    /// (ADR 0013 (a)).
    pub fn verifying_keys(&self) -> VerifyingKeys {
        self.verifying.clone()
    }
}

/// Why a compact JWS was not accepted. The variants tell a test and a log
/// line what failed; a caller answers all of them the same way, and none of
/// them carries anything of the token.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum JwsError {
    /// Not three non-empty base64url segments, or a header that is not a
    /// JSON object.
    #[error("the token is not a compact JWS")]
    Malformed,

    /// `alg` is not ES256, `none` included.
    #[error("the token is not signed with ES256")]
    Algorithm,

    /// `typ` is not the one expected here: an ID token presented as an
    /// access token, or the other way round.
    #[error("the token is of another type")]
    Type,

    /// A header member that points at another key or asks for an
    /// extension CAS does not implement.
    #[error("the token header carries a member CAS does not honour")]
    ForbiddenHeader,

    /// `kid` missing or not a published key.
    #[error("the token names no published key")]
    UnknownKey,

    /// The signature is not 64 bytes, or does not verify.
    #[error("the token signature does not verify")]
    Signature,
}

/// Header members that are refused rather than ignored. `jku`, `jwk`,
/// `x5u` and `x5c` name or carry a key other than the published ones (RFC
/// 8725 §3.10); `crit` lists extensions the recipient must understand, and
/// CAS understands none (RFC 7515 §4.1.11).
const FORBIDDEN_HEADER_MEMBERS: [&str; 5] = ["crit", "jku", "jwk", "x5u", "x5c"];

/// The public half of every published key, by `kid`, the active key first.
/// What CAS verifies its own tokens with: the userinfo access token and the
/// logout hint. `Debug` prints the `kid`s only.
#[derive(Clone)]
pub struct VerifyingKeys {
    keys: Vec<(String, PKey<Public>)>,
}

impl std::fmt::Debug for VerifyingKeys {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_list()
            .entries(self.keys.iter().map(|(kid, _)| kid))
            .finish()
    }
}

impl VerifyingKeys {
    /// Verifies a compact JWS CAS signed and returns its payload, the bytes
    /// as signed. Strict, because the only tokens it has to accept are the
    /// ones [`SigningKey::sign`] writes: three non-empty base64url segments
    /// without padding, a header object whose `alg` is ES256 and whose
    /// `typ` is exactly `typ`, a `kid` that is published, none of
    /// [`FORBIDDEN_HEADER_MEMBERS`], and a 64-byte `r || s` signature that
    /// verifies under that key. The payload is not interpreted here.
    pub fn verify(&self, jws: &str, typ: &str) -> Result<Vec<u8>, JwsError> {
        let mut segments = jws.split('.');
        let (Some(header), Some(payload), Some(signature), None) = (
            segments.next(),
            segments.next(),
            segments.next(),
            segments.next(),
        ) else {
            return Err(JwsError::Malformed);
        };
        if header.is_empty() || payload.is_empty() || signature.is_empty() {
            return Err(JwsError::Malformed);
        }

        let header_bytes = URL_SAFE_NO_PAD
            .decode(header)
            .map_err(|_| JwsError::Malformed)?;
        let serde_json::Value::Object(members) =
            serde_json::from_slice(&header_bytes).map_err(|_| JwsError::Malformed)?
        else {
            return Err(JwsError::Malformed);
        };
        if members.get("alg").and_then(|alg| alg.as_str()) != Some(SIGNING_ALGORITHM) {
            return Err(JwsError::Algorithm);
        }
        if members.get("typ").and_then(|value| value.as_str()) != Some(typ) {
            return Err(JwsError::Type);
        }
        if FORBIDDEN_HEADER_MEMBERS
            .iter()
            .any(|name| members.contains_key(*name))
        {
            return Err(JwsError::ForbiddenHeader);
        }
        let kid = members.get("kid").and_then(|kid| kid.as_str());
        let (_, key) = self
            .keys
            .iter()
            .find(|(candidate, _)| Some(candidate.as_str()) == kid)
            .ok_or(JwsError::UnknownKey)?;

        let payload_bytes = URL_SAFE_NO_PAD
            .decode(payload)
            .map_err(|_| JwsError::Malformed)?;
        let raw = URL_SAFE_NO_PAD
            .decode(signature)
            .map_err(|_| JwsError::Malformed)?;
        let field = P256_FIELD_BYTES as usize;
        if raw.len() != 2 * field {
            return Err(JwsError::Signature);
        }

        // JWS `r || s` back to the DER `ECDSA-Sig-Value` OpenSSL verifies
        // (JWA §3.4), the inverse of what `sign` does.
        let der = BigNum::from_slice(&raw[..field])
            .and_then(|r| Ok((r, BigNum::from_slice(&raw[field..])?)))
            .and_then(|(r, s)| EcdsaSig::from_private_components(r, s))
            .and_then(|signature| signature.to_der())
            .map_err(|_| JwsError::Signature)?;
        let signing_input_length = header.len() + 1 + payload.len();
        let signing_input = &jws.as_bytes()[..signing_input_length];
        let verified = Verifier::new(MessageDigest::sha256(), key)
            .and_then(|mut verifier| verifier.verify_oneshot(&der, signing_input))
            .unwrap_or(false);
        if !verified {
            return Err(JwsError::Signature);
        }

        Ok(payload_bytes)
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
    let public = EcKey::from_public_key(group, ec_key.public_key())
        .and_then(PKey::from_ec_key)
        .map_err(|_| SigningKeyError::Inconsistent { index })?;
    let jwk = PublicJwk {
        kty: "EC",
        crv: "P-256",
        x,
        y,
        kid: kid.clone(),
        use_: "sig",
        alg: SIGNING_ALGORITHM,
    };

    Ok(SigningKey {
        kid,
        pkey,
        public,
        jwk,
    })
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
    use crate::testing::{
        DEV_SIGNING_KEY as DEV_KEY, DEV_SIGNING_KEY_KID as DEV_KEY_KID, fresh_signing_key_pem,
    };
    use openssl::ec::EcGroup;
    use openssl::rsa::Rsa;
    use openssl::symm::Cipher;

    fn p256() -> EcGroup {
        EcGroup::from_curve_name(Nid::X9_62_PRIME256V1).unwrap()
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
        let second = fresh_signing_key_pem();
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

    fn dev_keys() -> SigningKeys {
        SigningKeys::from_pem(DEV_KEY).unwrap()
    }

    /// A compact JWS with a header of the test's choosing, signed by `key`
    /// as `sign` would sign it: what a forger with a key of their own, or a
    /// buggy issuer, would produce.
    fn forge(key: &SigningKey, header: serde_json::Value, payload: &[u8]) -> String {
        let signing_input = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(header.to_string()),
            URL_SAFE_NO_PAD.encode(payload)
        );
        let mut signer = Signer::new(MessageDigest::sha256(), &key.pkey).unwrap();
        let der = signer
            .sign_oneshot_to_vec(signing_input.as_bytes())
            .unwrap();
        let signature = EcdsaSig::from_der(&der).unwrap();
        let mut raw = signature.r().to_vec_padded(P256_FIELD_BYTES).unwrap();
        raw.extend(signature.s().to_vec_padded(P256_FIELD_BYTES).unwrap());
        format!("{signing_input}.{}", URL_SAFE_NO_PAD.encode(raw))
    }

    fn header(typ: &str, kid: &str) -> serde_json::Value {
        serde_json::json!({"alg": "ES256", "typ": typ, "kid": kid})
    }

    #[test]
    fn a_token_signed_by_the_active_key_verifies_back_to_its_payload() {
        let keys = dev_keys();
        let jws = keys.active().sign("at+jwt", br#"{"sub":"ada"}"#);

        assert_eq!(
            keys.verifying_keys().verify(&jws, "at+jwt"),
            Ok(br#"{"sub":"ada"}"#.to_vec())
        );
    }

    /// `typ` is what keeps an ID token from passing as an access token and
    /// the other way round, so it is compared exactly.
    #[test]
    fn a_token_of_another_type_is_refused() {
        let keys = dev_keys();
        let verifying = keys.verifying_keys();

        let id_token = keys.active().sign("JWT", b"{}");
        assert_eq!(verifying.verify(&id_token, "at+jwt"), Err(JwsError::Type));
        let access_token = keys.active().sign("at+jwt", b"{}");
        assert_eq!(verifying.verify(&access_token, "JWT"), Err(JwsError::Type));
        let upper = keys.active().sign("AT+JWT", b"{}");
        assert_eq!(verifying.verify(&upper, "at+jwt"), Err(JwsError::Type));

        let untyped = forge(
            keys.active(),
            serde_json::json!({"alg": "ES256", "kid": DEV_KEY_KID}),
            b"{}",
        );
        assert_eq!(verifying.verify(&untyped, "JWT"), Err(JwsError::Type));
    }

    #[test]
    fn another_algorithm_is_refused_none_included() {
        let keys = dev_keys();
        let verifying = keys.verifying_keys();
        let payload = URL_SAFE_NO_PAD.encode(b"{}");

        for alg in ["none", "HS256", "RS256", "ES384", "es256"] {
            let header = URL_SAFE_NO_PAD.encode(
                serde_json::json!({"alg": alg, "typ": "JWT", "kid": DEV_KEY_KID}).to_string(),
            );
            // An unsigned token, as `alg: none` would carry, and one with a
            // signature of the right size.
            for signature in ["", &URL_SAFE_NO_PAD.encode([7u8; 64])] {
                let jws = format!("{header}.{payload}.{signature}");
                assert!(verifying.verify(&jws, "JWT").is_err(), "{alg} {jws}");
            }
            let jws = format!("{header}.{payload}.{}", URL_SAFE_NO_PAD.encode([7u8; 64]));
            assert_eq!(
                verifying.verify(&jws, "JWT"),
                Err(JwsError::Algorithm),
                "{alg}"
            );
        }

        let signed_as_hs256 = forge(
            keys.active(),
            serde_json::json!({"alg": "HS256", "typ": "JWT", "kid": DEV_KEY_KID}),
            b"{}",
        );
        assert_eq!(
            verifying.verify(&signed_as_hs256, "JWT"),
            Err(JwsError::Algorithm)
        );
    }

    #[test]
    fn a_key_that_is_not_published_is_refused() {
        let verifying = dev_keys().verifying_keys();
        let other = SigningKeys::from_pem(&fresh_signing_key_pem()).unwrap();

        let jws = other.active().sign("JWT", b"{}");
        assert_eq!(verifying.verify(&jws, "JWT"), Err(JwsError::UnknownKey));

        let without_kid = forge(
            dev_keys().active(),
            serde_json::json!({"alg": "ES256", "typ": "JWT"}),
            b"{}",
        );
        assert_eq!(
            verifying.verify(&without_kid, "JWT"),
            Err(JwsError::UnknownKey)
        );
    }

    /// A forger who copies the published `kid` into a token signed with
    /// their own key gains nothing: the signature is checked under the key
    /// the `kid` names.
    #[test]
    fn a_token_signed_by_another_key_under_a_published_kid_is_refused() {
        let verifying = dev_keys().verifying_keys();
        let other = SigningKeys::from_pem(&fresh_signing_key_pem()).unwrap();

        let jws = forge(other.active(), header("JWT", DEV_KEY_KID), b"{}");

        assert_eq!(verifying.verify(&jws, "JWT"), Err(JwsError::Signature));
    }

    #[test]
    fn a_tampered_payload_or_signature_is_refused() {
        let keys = dev_keys();
        let verifying = keys.verifying_keys();
        let jws = keys.active().sign("JWT", br#"{"sub":"ada"}"#);
        let [header, _, signature] = jws.split('.').collect::<Vec<_>>()[..] else {
            unreachable!()
        };

        let other_payload = URL_SAFE_NO_PAD.encode(br#"{"sub":"eve"}"#);
        let tampered = format!("{header}.{other_payload}.{signature}");
        assert_eq!(verifying.verify(&tampered, "JWT"), Err(JwsError::Signature));

        let mut raw = URL_SAFE_NO_PAD.decode(signature).unwrap();
        raw[10] ^= 0x01;
        let flipped =
            jws.rsplit_once('.').unwrap().0.to_owned() + "." + &URL_SAFE_NO_PAD.encode(&raw);
        assert_eq!(verifying.verify(&flipped, "JWT"), Err(JwsError::Signature));
    }

    #[test]
    fn a_signature_of_the_wrong_length_is_refused() {
        let keys = dev_keys();
        let verifying = keys.verifying_keys();
        let jws = keys.active().sign("JWT", b"{}");
        let (signing_input, signature) = jws.rsplit_once('.').unwrap();
        let raw = URL_SAFE_NO_PAD.decode(signature).unwrap();

        let short = format!("{signing_input}.{}", URL_SAFE_NO_PAD.encode(&raw[..63]));
        assert_eq!(verifying.verify(&short, "JWT"), Err(JwsError::Signature));

        let mut longer = raw.clone();
        longer.push(0);
        let long = format!("{signing_input}.{}", URL_SAFE_NO_PAD.encode(&longer));
        assert_eq!(verifying.verify(&long, "JWT"), Err(JwsError::Signature));
    }

    #[test]
    fn anything_but_three_non_empty_base64url_segments_is_malformed() {
        let keys = dev_keys();
        let verifying = keys.verifying_keys();
        let jws = keys.active().sign("JWT", b"{}");
        let (header, rest) = jws.split_once('.').unwrap();
        let (payload, signature) = rest.split_once('.').unwrap();

        for candidate in [
            String::new(),
            format!("{header}.{payload}"),
            format!("{jws}.{signature}"),
            format!("{header}..{signature}"),
            format!(".{payload}.{signature}"),
            format!("{header}.{payload}="),
            format!("{header}=.{payload}.{signature}"),
            format!("{header}.{payload}.{signature}="),
            format!("{}.{payload}.{signature}", URL_SAFE_NO_PAD.encode("[1]")),
            format!(
                "{}.{payload}.{signature}",
                URL_SAFE_NO_PAD.encode("not json")
            ),
        ] {
            assert_eq!(
                verifying.verify(&candidate, "JWT"),
                Err(JwsError::Malformed),
                "{candidate}"
            );
        }
    }

    #[test]
    fn a_header_that_points_at_another_key_is_refused() {
        let keys = dev_keys();
        let verifying = keys.verifying_keys();

        for (name, value) in [
            ("crit", serde_json::json!(["exp"])),
            ("jku", serde_json::json!("https://evil.example/jwks.json")),
            ("jwk", serde_json::to_value(keys.active().jwk()).unwrap()),
            ("x5u", serde_json::json!("https://evil.example/cert.pem")),
            ("x5c", serde_json::json!(["MIIB"])),
        ] {
            let mut header = header("JWT", DEV_KEY_KID);
            header[name] = value;
            let jws = forge(keys.active(), header, b"{}");

            assert_eq!(
                verifying.verify(&jws, "JWT"),
                Err(JwsError::ForbiddenHeader),
                "{name}"
            );
        }
    }

    /// Rotation: a token signed by the key that used to be active verifies
    /// for as long as that key is still published, second in the list.
    #[test]
    fn a_token_of_a_key_published_second_verifies() {
        let new = fresh_signing_key_pem();
        let before = dev_keys();
        let after = SigningKeys::from_pem(&format!("{new}{DEV_KEY}")).unwrap();
        let jws = before.active().sign("JWT", b"{}");

        assert_ne!(after.active().kid(), DEV_KEY_KID);
        assert_eq!(
            after.verifying_keys().verify(&jws, "JWT"),
            Ok(b"{}".to_vec())
        );
        let fresh = after.active().sign("JWT", b"{}");
        assert_eq!(
            after.verifying_keys().verify(&fresh, "JWT"),
            Ok(b"{}".to_vec())
        );
    }

    #[test]
    fn no_verification_error_quotes_the_token() {
        let keys = dev_keys();
        let jws = keys.active().sign("JWT", br#"{"email":"ada@example.com"}"#);

        let error = keys.verifying_keys().verify(&jws, "at+jwt").unwrap_err();

        let text = format!("{error} {error:?}");
        assert!(!text.contains("ada"), "{text}");
        for segment in jws.split('.') {
            assert!(!text.contains(segment), "{text}");
        }
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
