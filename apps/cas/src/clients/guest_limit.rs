//! The per-client limit of the guest grant: how many guest accounts a client
//! may mint per minute. How it crosses the database boundary is the
//! repository's business (`repository.rs`). See
//! `docs/adr/0014-guest-accounts-and-the-guest-grant.md` (e).

use nutype::nutype;

/// What a client registered without a limit gets. The column's `DEFAULT` in
/// the `guest_accounts` migration is the same number, so a row written by the
/// previous release's `cas-client`, which does not know the column, agrees
/// with one written by this release; change both or neither.
const DEFAULT_GUEST_GRANTS_PER_MINUTE: i32 = 60;

/// How many guest accounts a client may mint in a sliding minute. Positive:
/// a client that may mint none is one without `guest_login_allowed`, not one
/// with a limit of zero; the table's CHECK says the same. An `i32` because
/// the column is an `integer`, so neither side of the database needs a
/// fallible conversion.
#[nutype(
    validate(greater = 0),
    derive(Debug, Clone, Copy, PartialEq, Eq, Display, Into)
)]
pub struct GuestGrantsPerMinute(i32);

impl Default for GuestGrantsPerMinute {
    fn default() -> Self {
        Self::try_new(DEFAULT_GUEST_GRANTS_PER_MINUTE).expect("the default limit is positive")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_and_negatives_are_refused() {
        for value in [0, -1, i32::MIN] {
            assert_eq!(
                GuestGrantsPerMinute::try_new(value),
                Err(GuestGrantsPerMinuteError::GreaterViolated),
                "{value}"
            );
        }
    }

    #[test]
    fn a_positive_value_is_kept() {
        for value in [1, 5, i32::MAX] {
            assert_eq!(
                GuestGrantsPerMinute::try_new(value).map(i32::from),
                Ok(value)
            );
        }
    }

    #[test]
    fn the_default_is_sixty() {
        assert_eq!(i32::from(GuestGrantsPerMinute::default()), 60);
    }
}
