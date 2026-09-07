//! Accounts — the identity root of CAS.
//!
//! An account id is the OIDC `sub`. Guests are ordinary rows
//! (`type = AccountType::Guest`) so sessions, `/me` and userinfo have a single
//! code path for guests and full accounts; a guest that registers a passkey is
//! upgraded in place, keeping its `sub`. See `docs/PLAN.md`.

use nutype::nutype;
use sqlx::PgPool;
use time::OffsetDateTime;
use unicode_general_category::GeneralCategory;
use unicode_normalization::UnicodeNormalization;
use uuid::Uuid;

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

// `nutype` cannot derive the sqlx traits, so the three that let a
// `DisplayName` cross the database boundary are written by hand. Together they
// make the reader — not the table, which has no CHECK — the guarantee that a
// stored display name is valid.

/// A `DisplayName` is a Postgres text value, exactly like the `String` it
/// wraps.
impl sqlx::Type<sqlx::Postgres> for DisplayName {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        <String as sqlx::Type<sqlx::Postgres>>::type_info()
    }

    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        <String as sqlx::Type<sqlx::Postgres>>::compatible(ty)
    }
}

/// Re-validates on the way out of the database: a row that does not pass fails
/// to decode instead of becoming an unchecked `DisplayName`.
impl<'r> sqlx::Decode<'r, sqlx::Postgres> for DisplayName {
    fn decode(value: sqlx::postgres::PgValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let value = <String as sqlx::Decode<'r, sqlx::Postgres>>::decode(value)?;
        Self::try_new(value).map_err(Into::into)
    }
}

/// Lets a query bind the newtype directly, without unwrapping it to a
/// `String` first.
impl sqlx::Encode<'_, sqlx::Postgres> for DisplayName {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
        let value: &str = self.as_ref();
        <&str as sqlx::Encode<'_, sqlx::Postgres>>::encode_by_ref(&value, buf)
    }
}

/// Whether an account has credentials of its own.
///
/// Maps to the Postgres `account_type` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "account_type", rename_all = "lowercase")]
pub enum AccountType {
    /// Temporary identity created without any user interaction.
    Guest,
    /// Account with at least one credential (a passkey).
    Full,
}

/// A row of `accounts`.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Account {
    /// Stable account id, exposed as the OIDC `sub`.
    pub id: Uuid,
    /// Non-unique: CAS has no username in v1. Always a valid [`DisplayName`]:
    /// validated when the row is decoded, so a row that was written or altered
    /// outside CAS and does not pass surfaces as a decode error instead of
    /// reaching a UI.
    pub display_name: DisplayName,
    pub r#type: AccountType,
    /// Optional and unverified in v1; the future recovery anchor.
    pub email: Option<String>,
    pub created_at: OffsetDateTime,
    /// Refreshed on activity; drives guest GC.
    pub last_seen_at: OffsetDateTime,
}

/// The values a caller supplies when creating an account. `created_at` and
/// `last_seen_at` are assigned by the database.
#[derive(Debug, Clone)]
pub struct NewAccount {
    /// Generated by CAS, not by the database: passkey registration hands the id
    /// to the authenticator as the WebAuthn user handle before the row exists.
    /// The handle is baked into the credential and can never change, and
    /// discoverable login (#666) gets it back as the account to sign in.
    /// Defaults to a fresh v4 uuid; [`NewAccount::with_id`] pins a chosen one.
    pub id: Uuid,
    pub display_name: DisplayName,
    pub r#type: AccountType,
    pub email: Option<String>,
}

impl NewAccount {
    /// A guest: no credentials, no email.
    pub fn guest(display_name: DisplayName) -> Self {
        Self {
            id: Uuid::new_v4(),
            display_name,
            r#type: AccountType::Guest,
            email: None,
        }
    }

    /// A full account. Email stays optional — registration only asks for a
    /// display name.
    pub fn full(display_name: DisplayName) -> Self {
        Self {
            id: Uuid::new_v4(),
            display_name,
            r#type: AccountType::Full,
            email: None,
        }
    }

    /// Uses an id chosen by the caller instead of the generated one. Passkey
    /// registration needs this: the id travels to the authenticator when the
    /// ceremony starts, the row is written when it finishes.
    #[must_use]
    pub fn with_id(mut self, id: Uuid) -> Self {
        self.id = id;
        self
    }

    #[must_use]
    pub fn with_email(mut self, email: impl Into<String>) -> Self {
        self.email = Some(email.into());
        self
    }
}

/// Inserts an account with any executor — a pool, or the transaction that
/// registration uses to write an account and its first passkey together.
pub(crate) async fn insert<'e, E>(executor: E, account: NewAccount) -> Result<Account, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query_as!(
        Account,
        r#"INSERT INTO accounts (id, display_name, type, email)
           VALUES ($1, $2, $3, $4)
           RETURNING
               id,
               display_name AS "display_name: DisplayName",
               type AS "type: AccountType",
               email,
               created_at,
               last_seen_at"#,
        account.id,
        // `as _`: the macro infers `&str` for a text parameter, so the cast is
        // what makes it use the `Encode` impl for the newtype instead.
        account.display_name as _,
        account.r#type as AccountType,
        account.email,
    )
    .fetch_one(executor)
    .await
}

/// Data access for `accounts`.
#[derive(Debug, Clone)]
pub struct AccountRepository {
    pool: PgPool,
}

impl AccountRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Inserts an account and returns the stored row, including the
    /// database-assigned timestamps.
    pub async fn create(&self, account: NewAccount) -> Result<Account, sqlx::Error> {
        insert(&self.pool, account).await
    }

    /// Looks an account up by id. `Ok(None)` means no such account.
    pub async fn get(&self, id: Uuid) -> Result<Option<Account>, sqlx::Error> {
        sqlx::query_as!(
            Account,
            r#"SELECT
                   id,
                   display_name AS "display_name: DisplayName",
                   type AS "type: AccountType",
                   email,
                   created_at,
                   last_seen_at
               FROM accounts
               WHERE id = $1"#,
            id,
        )
        .fetch_optional(&self.pool)
        .await
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::display_name;

    #[sqlx::test]
    async fn creates_a_full_account_with_an_email(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let account = repository
            .create(NewAccount::full(display_name("Ada")).with_email("ada@example.com"))
            .await
            .unwrap();

        assert_eq!(account.display_name.as_ref(), "Ada");
        assert_eq!(account.r#type, AccountType::Full);
        assert_eq!(account.email.as_deref(), Some("ada@example.com"));
        // A fresh account has never been seen after its creation.
        assert_eq!(account.last_seen_at, account.created_at);
    }

    #[sqlx::test]
    async fn creates_a_guest_without_an_email(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let account = repository
            .create(NewAccount::guest(display_name("Guest")))
            .await
            .unwrap();

        assert_eq!(account.r#type, AccountType::Guest);
        assert_eq!(account.email, None);
    }

    #[sqlx::test]
    async fn get_returns_the_created_account(pool: PgPool) {
        let repository = AccountRepository::new(pool);
        let created = repository
            .create(NewAccount::full(display_name("Grace")))
            .await
            .unwrap();

        let found = repository.get(created.id).await.unwrap();

        assert_eq!(found, Some(created));
    }

    #[sqlx::test]
    async fn get_returns_none_for_an_unknown_id(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let found = repository.get(Uuid::new_v4()).await.unwrap();

        assert_eq!(found, None);
    }

    #[sqlx::test]
    async fn creates_an_account_with_a_caller_chosen_id(pool: PgPool) {
        let repository = AccountRepository::new(pool);
        let id = Uuid::new_v4();

        let account = repository
            .create(NewAccount::full(display_name("Ada")).with_id(id))
            .await
            .unwrap();

        assert_eq!(account.id, id);
    }

    /// The table has no CHECK, so nothing stops a row written outside CAS from
    /// holding a name with a bidi override in it. The reader is the guarantee:
    /// such a row fails to decode instead of reaching a UI.
    #[sqlx::test]
    async fn get_fails_to_decode_an_invalid_display_name(pool: PgPool) {
        let id = Uuid::new_v4();
        // Unchecked query: see docs/TESTS.md.
        sqlx::query("INSERT INTO accounts (id, display_name, type) VALUES ($1, $2, 'full')")
            .bind(id)
            .bind("\u{202e}adA")
            .execute(&pool)
            .await
            .unwrap();

        let error = AccountRepository::new(pool).get(id).await.unwrap_err();

        assert!(
            matches!(error, sqlx::Error::ColumnDecode { .. }),
            "expected a column decode error, got {error:?}"
        );
    }

    /// v1 has no username: two accounts may share a display name.
    #[sqlx::test]
    async fn display_names_are_not_unique(pool: PgPool) {
        let repository = AccountRepository::new(pool);

        let first = repository
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();
        let second = repository
            .create(NewAccount::full(display_name("Ada")))
            .await
            .unwrap();

        assert_ne!(first.id, second.id);
    }
}
