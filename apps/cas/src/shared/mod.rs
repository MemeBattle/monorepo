//! Shared vocabulary: types and rules that more than one bounded context
//! needs and none of them owns. Only domain-level, context-free material
//! belongs here — no axum, no SQL, no configuration (that is `config`, `db`
//! and `migrations`). Contexts depend on this module; it depends on nothing
//! of theirs.

pub mod label;
