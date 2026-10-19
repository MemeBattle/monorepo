//! A passkey whose private key is a constant, built by hand.
//!
//! `ResidentSoftPasskey` keeps its key inside webauthn-authenticator-rs, where
//! no test can reach it, so a credential it registered can only ever be used
//! by the same process. This authenticator's key is a constant: a passkey
//! registered with it can be stored as a fixture and signed in with later,
//! under another version of webauthn-rs (`webauthn::stored_data_tests`).
//!
//! It speaks only the wire format, with no type of webauthn-rs in its own
//! code: the attestation object is CBOR written byte by byte (`none`
//! attestation, an ES256 COSE key), and the assertion is signed with `p256`.
//! The responses are built as JSON and parsed into the library's types, the
//! way a browser's answer reaches CAS.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use p256::ecdsa::{Signature, SigningKey, signature::Signer as _};
use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};
use webauthn_rs::prelude::{PublicKeyCredential, RegisterPublicKeyCredential};

/// User present, user verified.
const FLAGS_UP_UV: u8 = 0x01 | 0x04;
/// User present, user verified, attested credential data included.
const FLAGS_UP_UV_AT: u8 = FLAGS_UP_UV | 0x40;

pub struct FixedKeyPasskey {
    key: SigningKey,
    credential_id: Vec<u8>,
    rp_id: String,
    origin: String,
}

impl FixedKeyPasskey {
    /// `secret` is the P-256 private scalar, big-endian.
    pub fn new(secret: [u8; 32], credential_id: &[u8], rp_id: &str, origin: &str) -> Self {
        Self {
            key: SigningKey::from_bytes(&secret.into()).expect("a valid P-256 scalar"),
            credential_id: credential_id.to_vec(),
            rp_id: rp_id.to_string(),
            origin: origin.trim_end_matches('/').to_string(),
        }
    }

    /// Answers a registration challenge (base64url, as the browser receives
    /// it) with this key and `none` attestation.
    pub fn registration(&self, challenge: &str) -> RegisterPublicKeyCredential {
        let client_data = self.client_data("webauthn.create", challenge);

        let mut auth_data = self.rp_id_hash().to_vec();
        auth_data.push(FLAGS_UP_UV_AT);
        auth_data.extend_from_slice(&0u32.to_be_bytes());
        auth_data.extend_from_slice(&[0; 16]); // AAGUID: none
        let id_len = u16::try_from(self.credential_id.len()).expect("a short credential id");
        auth_data.extend_from_slice(&id_len.to_be_bytes());
        auth_data.extend_from_slice(&self.credential_id);
        auth_data.extend_from_slice(&self.cose_key());

        // {"fmt": "none", "attStmt": {}, "authData": h'…'}
        let mut attestation = vec![0xa3];
        attestation.extend_from_slice(&cbor_text("fmt"));
        attestation.extend_from_slice(&cbor_text("none"));
        attestation.extend_from_slice(&cbor_text("attStmt"));
        attestation.push(0xa0);
        attestation.extend_from_slice(&cbor_text("authData"));
        attestation.extend_from_slice(&cbor_bytes(&auth_data));

        parse(json!({
            "id": URL_SAFE_NO_PAD.encode(&self.credential_id),
            "rawId": URL_SAFE_NO_PAD.encode(&self.credential_id),
            "type": "public-key",
            "response": {
                "attestationObject": URL_SAFE_NO_PAD.encode(&attestation),
                "clientDataJSON": URL_SAFE_NO_PAD.encode(&client_data),
            },
            "extensions": {},
        }))
    }

    /// Answers a login challenge (base64url) as the discoverable credential
    /// of the account whose id is `user_handle`, with the given signature
    /// counter.
    pub fn assertion(
        &self,
        challenge: &str,
        user_handle: &[u8],
        counter: u32,
    ) -> PublicKeyCredential {
        let client_data = self.client_data("webauthn.get", challenge);

        let mut auth_data = self.rp_id_hash().to_vec();
        auth_data.push(FLAGS_UP_UV);
        auth_data.extend_from_slice(&counter.to_be_bytes());

        let mut signed = auth_data.clone();
        signed.extend_from_slice(&Sha256::digest(&client_data));
        let signature: Signature = self.key.sign(&signed);

        parse(json!({
            "id": URL_SAFE_NO_PAD.encode(&self.credential_id),
            "rawId": URL_SAFE_NO_PAD.encode(&self.credential_id),
            "type": "public-key",
            "response": {
                "authenticatorData": URL_SAFE_NO_PAD.encode(&auth_data),
                "clientDataJSON": URL_SAFE_NO_PAD.encode(&client_data),
                "signature": URL_SAFE_NO_PAD.encode(signature.to_der()),
                "userHandle": URL_SAFE_NO_PAD.encode(user_handle),
            },
            "extensions": {},
        }))
    }

    fn client_data(&self, kind: &str, challenge: &str) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "type": kind,
            "challenge": challenge,
            "origin": self.origin,
            "crossOrigin": false,
        }))
        .expect("client data serialises")
    }

    fn rp_id_hash(&self) -> [u8; 32] {
        Sha256::digest(self.rp_id.as_bytes()).into()
    }

    /// {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
    fn cose_key(&self) -> Vec<u8> {
        let point = self.key.verifying_key().to_encoded_point(false);
        let mut key = vec![0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21];
        key.extend_from_slice(&cbor_bytes(point.x().expect("an uncompressed point")));
        key.push(0x22);
        key.extend_from_slice(&cbor_bytes(point.y().expect("an uncompressed point")));
        key
    }
}

fn parse<T: serde::de::DeserializeOwned>(value: Value) -> T {
    serde_json::from_value(value).expect("the response has the browser's shape")
}

fn cbor_text(text: &str) -> Vec<u8> {
    cbor_header(3, text.len())
        .into_iter()
        .chain(text.bytes())
        .collect()
}

fn cbor_bytes(bytes: &[u8]) -> Vec<u8> {
    let mut out = cbor_header(2, bytes.len());
    out.extend_from_slice(bytes);
    out
}

fn cbor_header(major: u8, len: usize) -> Vec<u8> {
    let major = major << 5;
    match len {
        0..=23 => vec![major | len as u8],
        24..=0xff => vec![major | 24, len as u8],
        _ => {
            let len = u16::try_from(len).expect("a short CBOR item");
            let [hi, lo] = len.to_be_bytes();
            vec![major | 25, hi, lo]
        }
    }
}
