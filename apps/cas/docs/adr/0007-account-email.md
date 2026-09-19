# 7. The account email

## Status

Accepted (2026-09-19), with [#721](https://github.com/MemeBattle/monorepo/issues/721).

## Context

`accounts.email` has existed since the table did: optional, unverified, not
unique, the future recovery anchor (`docs/PLAN.md`). `GET /api/me` (ADR
0004) has returned it from the start, and nothing could set it. The
dashboard (#671) wants a field that saves and clears the address, with a
nudge to fill it in; verification and the magic-link recovery built on it
arrive with M4.

The session (ADR 0004) says who is asking. The questions are where the
write lives, since `/api/me` is served by the sessions router; what an
address has to look like to be accepted when nothing will check that it
receives mail; and what the store keeps.

## Decision

**(a) `PATCH /api/me` with `{ "email": string | null }`, `Authenticated`,
answering `204`.** The dashboard reads the account through `/api/me`, so
the write goes to the same resource: one path the frontend addresses for
"the signed-in account", read and written. The account id comes from the
session and never from the body; the body has one field and it is required,
because with the serde default a missing key would read as `null` and clear
an address the client never mentioned (a body without it is `422
invalid_body`). `null` clears. The call is idempotent: the same body twice
leaves the same row, and clearing an absent address is a `204` like any
other. Nothing is returned; the acceptance criterion is a round trip
through `GET /api/me`, and a second representation of the account on the
wire would be one more shape to keep in step with `Me`.

**(b) The write belongs to the accounts context, merged at the same path.**
`GET /api/me` is the session's question — "who does this cookie name" —
answered with the account attached, and it stays in the sessions router.
`PATCH /api/me` changes the account; the session is only how the caller is
identified, as it is for `/api/passkeys` (ADR 0006 (a)). Sessions know
nothing about what an account's fields mean, so the handler, the error
mapping and the service live in `accounts/`: the context gains its `http/`
and a `management` service the way `webauthn` has `PasskeyManagement`. The
transport root merges the accounts router next to the sessions one, and
axum merges the two method routers for `/me`: one path, two owners by verb.
No new prefix is mounted, and the Fetch Metadata line (ADR 0005) covers the
`PATCH` by where `/api` is; the representative-route test in `http/mod.rs`
lists it.

**(c) An address is accepted on its syntax alone, in an `Email` newtype
of the accounts context.** The rules are the ones a form can explain and a
typo is caught by, and nothing more — no attempt to say whether the mailbox
exists, which is what verification (M4) will prove. In order, on the value
after sanitising:

- surrounding whitespace is trimmed;
- the part after the last `@` is lower-cased, the local part never: domain
  names are case-insensitive and one stored form should say so, while RFC
  5321 leaves the local part's case to the receiving host, and rewriting it
  could name another mailbox;
- not empty; at most 254 bytes of UTF-8, the longest address a forward path
  of 256 octets with its angle brackets can carry — octets, as RFC 5321
  counts them, not characters;
- no whitespace, control, format (invisible), separator, surrogate, private
  use or unassigned character anywhere: none can be part of a mailbox, and
  the invisible ones make one address look like another;
- exactly one `@`, with a non-empty local part before it and a non-empty
  domain after it;
- the domain is non-empty labels separated by single dots: `ada@example.`
  and `ada@.com` are typos, not domains;
- each label is letters, digits and hyphens (RFC 5321 §4.1.2), not starting
  or ending with a hyphen, with letters and digits read across every script
  and combining marks allowed, so `пример.рф` passes and `example.com/`,
  `exam,ple.com`, `exa_mple.com` do not. No address literal (`[127.0.0.1]`):
  nothing here will ever connect to one.

Non-ASCII local parts and domains pass as typed: the rules are about shape,
not alphabet, and the frontend's own `type=email` input is the stricter
gate for now. A dotless domain (`ada@localhost`) passes too; requiring a
dot would be a guess about deliverability, which is not this layer's
question. The rules are not the label rules (`shared::label`): an address
is not shown as a name, and its characters are its own business. The
newtype has an error type of its own, `EmailError`, one variant per rule so
the message names the rule broken, and it is mapped next to the handler:
**a bad address is `400 invalid_email`**, the message `Invalid email: <rule>`.

**(d) Stored as text, unverified, not unique, and not re-validated on the
way out.** The column is the one the accounts migration created: nullable
`text` with no unique constraint, for the reason recorded there — an
unverified address must not let one account block another's real owner.
Two accounts may hold the same address; a test says so. The `Email` guards
the write, but `Account::email` stays an `Option<String>` and the reader
does not re-validate, unlike `DisplayName` (ADR 0006 (e)). Nothing signs
in with the address, and a stricter rule later must not turn an existing
row into a decode error that locks its account out of every authenticated
request over a field it cannot fix from there.

**(e) An account the session names but the write cannot find is `404
account_not_found`.** Only a race with the delete that cascades to the
session produces it; the next request under that cookie is a `401`. It is
named rather than left to the 500 fallback, and a service test covers it,
since the router cannot reach it: the session goes with the account.

**(f) The change is logged at `info` with the account id and whether the
address was set or cleared, never the address.** It is the future recovery
anchor, so a change to it is worth the line a passkey deletion gets (ADR
0006); the value belongs to the user and appears in no log.

## Consequences

- The dashboard (#722) saves and clears the address with one `PATCH` and
  reads it back through `/api/me`, which already carried `email`. `Me`
  does not change.
- No migration: the column, its nullability and the absence of a unique
  constraint are the accounts migration's. One query joins the offline
  cache.
- `ApiState` gains `accounts: AccountManagement`, the first service of the
  accounts context, and the test state in `testing.rs` builds it.
- When verification arrives (M4), it is a state next to the address —
  `email_verified_at` or the like — not a change to these rules or to the
  route; uniqueness becomes a question then, and the answer may be a
  partial unique index on verified addresses.
