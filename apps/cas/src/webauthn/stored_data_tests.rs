//! Rows written by an older webauthn-rs must still load under the current
//! one: passkeys live forever, and ceremony state may be in flight while a
//! release rolls out. See `docs/adr/0020-webauthn-rs-0-6.md`.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use webauthn_rs::prelude::Passkey;

use crate::accounts::{AccountRepository, NewAccount};
use crate::testing::{
    FixedKeyPasskey, TEST_ORIGIN, TEST_RP_ID, display_name, register_soft_passkey, test_webauthn,
};
use crate::webauthn::addition::AdditionService;
use crate::webauthn::ceremonies::{PendingAddition, PendingLogin, PendingRegistration};
use crate::webauthn::login::LoginService;
use crate::webauthn::registration::RegistrationService;

/// A `passkey_credentials` row of the fixed key: account, credential id and
/// the `credential` jsonb exactly as webauthn-rs 0.5.5 serialised it.
const PASSKEY: &str = include_str!("testdata/passkey-0.5.5.json");
/// The same for a passkey of the software authenticator, whose packed
/// self-attestation and `credProps` report the fixed key's lacks.
const SOFT_PASSKEY: &str = include_str!("testdata/soft-passkey-0.5.5.json");
/// The `state` jsonb of an unfinished registration ceremony.
const REGISTRATION_CEREMONY: &str = include_str!("testdata/registration-ceremony-0.5.5.json");
/// The `state` jsonb of an unfinished passkey addition for the fixture
/// passkey's account: its `exclude_credentials` lists the fixture passkey.
const ADDITION_CEREMONY: &str = include_str!("testdata/addition-ceremony-0.5.5.json");
/// The `state` jsonb of an unfinished login ceremony.
const AUTHENTICATION_CEREMONY: &str = include_str!("testdata/authentication-ceremony-0.5.5.json");

/// The fixture passkey's private key. Test-only, published on purpose.
const SECRET: [u8; 32] = [
    0x4c, 0x0a, 0x1e, 0x2b, 0x8d, 0x77, 0x13, 0x5f, 0x92, 0x3e, 0x61, 0xc4, 0x0d, 0xa8, 0x57, 0x29,
    0xe3, 0x16, 0x7b, 0x40, 0x9c, 0xf2, 0x35, 0x68, 0x01, 0xbd, 0x4a, 0x86, 0x2f, 0xd9, 0x73, 0x15,
];
/// The fixture passkey's credential id.
const CREDENTIAL_ID: &[u8] = b"cas-fixture-passkey-1";
/// The credential that answers the stored registration ceremony.
const SECOND_CREDENTIAL_ID: &[u8] = b"cas-fixture-passkey-2";

fn fixed_key(credential_id: &[u8]) -> FixedKeyPasskey {
    FixedKeyPasskey::new(SECRET, credential_id, TEST_RP_ID, TEST_ORIGIN)
}

fn fixture(text: &str) -> Value {
    serde_json::from_str(text).expect("a JSON fixture")
}

fn text(value: &Value) -> &str {
    value.as_str().expect("a string")
}

/// Writes the fixture passkey's account and its row as stored.
async fn insert_stored_passkey(pool: &PgPool) -> Uuid {
    let row = fixture(PASSKEY);
    let account_id: Uuid = text(&row["account_id"]).parse().unwrap();
    AccountRepository::new(pool.clone())
        .create(NewAccount::full(display_name("Grace")).with_id(account_id))
        .await
        .unwrap();
    // Unchecked query: see docs/TESTS.md.
    sqlx::query(
        "INSERT INTO passkey_credentials (account_id, credential_id, credential, name)
         VALUES ($1, $2, $3, 'Fixture')",
    )
    .bind(account_id)
    .bind(URL_SAFE_NO_PAD.decode(text(&row["credential_id"])).unwrap())
    .bind(&row["credential"])
    .execute(pool)
    .await
    .unwrap();
    account_id
}

/// Parks a stored ceremony state as an unexpired row of the given kind,
/// bound to `account_id` as `start_ceremony` would bind it.
async fn insert_ceremony(
    pool: &PgPool,
    kind: &str,
    state: &Value,
    account_id: Option<Uuid>,
) -> Uuid {
    let id = Uuid::new_v4();
    // Unchecked query: see docs/TESTS.md.
    sqlx::query(
        "INSERT INTO webauthn_ceremonies (id, kind, state, account_id, expires_at)
         VALUES ($1, $2::webauthn_ceremony_kind, $3, $4, now() + interval '5 minutes')",
    )
    .bind(id)
    .bind(kind)
    .bind(state)
    .bind(account_id)
    .execute(pool)
    .await
    .unwrap();
    id
}

/// Loads `stored` as `T` and checks that writing it back gives the same
/// JSON: what the current version writes, a replica still running the
/// version that wrote the fixture reads, so a rolling deploy or a rollback
/// leaves no row behind that one side cannot load.
fn round_trip<T: serde::Serialize + serde::de::DeserializeOwned>(stored: &Value) -> T {
    let loaded: T = serde_json::from_value(stored.clone()).unwrap();
    assert_eq!(&serde_json::to_value(&loaded).unwrap(), stored);
    loaded
}

#[test]
fn stored_passkeys_load_and_are_written_back_unchanged() {
    for stored in [PASSKEY, SOFT_PASSKEY] {
        let row = fixture(stored);
        let passkey: Passkey = round_trip(&row["credential"]);
        assert_eq!(
            URL_SAFE_NO_PAD.encode(passkey.cred_id()),
            text(&row["credential_id"])
        );
    }
}

#[test]
fn stored_ceremony_states_load_and_are_written_back_unchanged() {
    let registration: PendingRegistration = round_trip(&fixture(REGISTRATION_CEREMONY));
    assert_eq!(registration.display_name, display_name("Ada"));
    let addition: PendingAddition = round_trip(&fixture(ADDITION_CEREMONY));
    assert_eq!(
        addition.account_id.to_string(),
        text(&fixture(PASSKEY)["account_id"])
    );
    let _: PendingLogin = round_trip(&fixture(AUTHENTICATION_CEREMONY));
}

/// Twice: the first login rewrites the row with the current version's
/// serialisation (counter and flags), and the second reads that back.
#[sqlx::test]
async fn a_stored_passkey_signs_in(pool: PgPool) {
    let account_id = insert_stored_passkey(&pool).await;
    let service = LoginService::new(test_webauthn(), pool.clone());

    for counter in 1..=2 {
        let started = service.start().await.unwrap();
        let challenge =
            serde_json::to_value(&started.rcr).unwrap()["publicKey"]["challenge"].clone();
        let assertion =
            fixed_key(CREDENTIAL_ID).assertion(text(&challenge), account_id.as_bytes(), counter);
        let logged_in = service.finish(started.login_id, &assertion).await.unwrap();
        assert_eq!(logged_in.account.id, account_id);
        assert_eq!(
            logged_in.credential.passkey.cred_id().as_slice(),
            CREDENTIAL_ID
        );
    }
}

#[sqlx::test]
async fn a_stored_login_ceremony_finishes_with_a_stored_passkey(pool: PgPool) {
    let account_id = insert_stored_passkey(&pool).await;
    let state = fixture(AUTHENTICATION_CEREMONY);
    let login_id = insert_ceremony(&pool, "authentication", &state, None).await;

    let challenge = text(&state["state"]["ast"]["challenge"]);
    let assertion = fixed_key(CREDENTIAL_ID).assertion(challenge, account_id.as_bytes(), 1);
    let logged_in = LoginService::new(test_webauthn(), pool.clone())
        .finish(login_id, &assertion)
        .await
        .unwrap();
    assert_eq!(logged_in.account.id, account_id);
}

#[sqlx::test]
async fn a_stored_registration_ceremony_finishes(pool: PgPool) {
    let state = fixture(REGISTRATION_CEREMONY);
    let registration_id = insert_ceremony(&pool, "registration", &state, None).await;

    let challenge = text(&state["state"]["passkey"]["rs"]["challenge"]);
    let registered = RegistrationService::new(test_webauthn(), pool.clone())
        .finish(
            registration_id,
            &fixed_key(SECOND_CREDENTIAL_ID).registration(challenge),
        )
        .await
        .unwrap();
    assert_eq!(
        registered.account.id.to_string(),
        text(&state["account_id"])
    );
    assert_eq!(registered.account.display_name, display_name("Ada"));
}

#[sqlx::test]
async fn a_stored_addition_ceremony_finishes(pool: PgPool) {
    let account_id = insert_stored_passkey(&pool).await;
    let state = fixture(ADDITION_CEREMONY);
    let registration_id = insert_ceremony(&pool, "addition", &state, Some(account_id)).await;

    let challenge = text(&state["state"]["passkey"]["rs"]["challenge"]);
    let added = AdditionService::new(test_webauthn(), pool.clone())
        .finish(
            account_id,
            registration_id,
            &fixed_key(SECOND_CREDENTIAL_ID).registration(challenge),
        )
        .await
        .unwrap();
    assert_eq!(added.account_id, account_id);
    assert_eq!(added.credential_id, SECOND_CREDENTIAL_ID);
}

async fn ceremony_state(pool: &PgPool, id: Uuid) -> Value {
    // Unchecked query: see docs/TESTS.md.
    sqlx::query_scalar("SELECT state FROM webauthn_ceremonies WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn passkey_row(pool: &PgPool, account_id: Uuid) -> Value {
    // Unchecked query: see docs/TESTS.md.
    let (credential_id, credential): (Vec<u8>, Value) = sqlx::query_as(
        "SELECT credential_id, credential FROM passkey_credentials WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await
    .unwrap();
    json!({
        "account_id": account_id,
        "credential_id": URL_SAFE_NO_PAD.encode(credential_id),
        "credential": credential,
    })
}

fn write(name: &str, value: &Value) {
    let path = format!(
        "{}/src/webauthn/testdata/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    let mut text = serde_json::to_string_pretty(value).unwrap();
    text.push('\n');
    std::fs::write(path, text).unwrap();
}

/// Writes the fixtures under `testdata/`. Run once, under webauthn-rs 0.5.5:
/// `cargo test --lib capture_fixtures -- --ignored`.
#[sqlx::test]
#[ignore = "writes the fixtures; only meaningful under the webauthn-rs that produced them"]
async fn capture_fixtures(pool: PgPool) {
    let registration = RegistrationService::new(test_webauthn(), pool.clone());

    // A registration ceremony, left unfinished.
    let started = registration.start(display_name("Ada")).await.unwrap();
    write(
        "registration-ceremony-0.5.5.json",
        &ceremony_state(&pool, started.registration_id).await,
    );

    // A passkey of the fixed key, registered and stored.
    let started = registration.start(display_name("Grace")).await.unwrap();
    let challenge = serde_json::to_value(&started.ccr).unwrap()["publicKey"]["challenge"]
        .as_str()
        .unwrap()
        .to_string();
    let registered = registration
        .finish(
            started.registration_id,
            &fixed_key(CREDENTIAL_ID).registration(&challenge),
        )
        .await
        .unwrap();
    write(
        "passkey-0.5.5.json",
        &passkey_row(&pool, registered.account.id).await,
    );

    // A passkey addition for that account, left unfinished: the fixture
    // passkey goes into its `exclude_credentials`.
    let started = AdditionService::new(test_webauthn(), pool.clone())
        .start(&registered.account)
        .await
        .unwrap();
    write(
        "addition-ceremony-0.5.5.json",
        &ceremony_state(&pool, started.registration_id).await,
    );

    // A login ceremony, left unfinished.
    let started = LoginService::new(test_webauthn(), pool.clone())
        .start()
        .await
        .unwrap();
    write(
        "authentication-ceremony-0.5.5.json",
        &ceremony_state(&pool, started.login_id).await,
    );

    // A passkey of the software authenticator: packed self-attestation.
    let (_, registered) = register_soft_passkey(&pool).await;
    write(
        "soft-passkey-0.5.5.json",
        &passkey_row(&pool, registered.account.id).await,
    );
}
