# 6. Passkey management

## Status

Accepted (2026-09-12), with [#668](https://github.com/MemeBattle/monorepo/issues/668).

## Context

Registration (ADR 0001) stores a passkey under a default name and login
(ADR 0003) uses whichever passkey the authenticator offers. An account that
has more than one needs to tell them apart, and one that has lost a device
needs to remove its key. There is no recovery in v1 (`docs/PLAN.md`): an
account whose last passkey is gone can never be signed into again, and the
plan's answer is a second passkey rather than a reset flow.

The session (ADR 0004) says who is asking. The question is what an account
may do to its own passkeys, what it learns about anyone else's, and how the
last-passkey rule holds when two requests race.

## Decision

**(a) `/api/passkeys` is a resource of the signed-in account, not a
ceremony.** `GET /api/passkeys` lists, `PATCH /api/passkeys/{id}` renames,
`DELETE /api/passkeys/{id}` deletes. It is mounted next to `/api/webauthn`
rather than under it: the ceremonies are how a passkey comes to exist, this
is what happens to it afterwards, and the frontend addresses the two as
different things. Every handler takes `Authenticated`; the account id comes
from the session and never from the request.

**(b) A passkey that is not yours does not exist.** Rename and delete look
the row up by its id *and* the account id in one query, and a miss is
`404 passkey_not_found` whether the id belongs to someone else or to no one.
A caller learns nothing about which ids exist beyond its own. The list shows
the id, the name, `created_at` and `last_used_at`; the credential itself,
public key and counter included, is server-side state and is never sent.

**(c) The last passkey stays.** Deleting an account's only passkey is
`409 last_passkey`, with a message that says what to do instead: add another
one first. A conflict rather than a bad request, because the same request
succeeds once the account's state changes. The rule is about the count, not
the account type: a guest has no passkeys to delete, so "the last passkey of
a full account" and "the last passkey" are the same rule.

**(d) The count is taken under a lock.** The delete runs in a transaction
that first selects the account's passkey rows `FOR UPDATE`, then counts,
then deletes. Two deletes of the two remaining passkeys at once would both
count two and both proceed, leaving none; with the lock the second waits and
counts what the first left. Contention is per account and the transaction is
one read and one write.

**(e) A passkey's name is a display name.** It is shown as-is in a list,
next to other names, so it gets the same sanitising and the same rejections
as an account's display name (`accounts::DisplayName`): spaces normalised,
NFC, no invisible or direction-changing characters, the same length cap. The
type is its own (`PasskeyName`) because the two are different things, but
the rules are one implementation, not two. A bad name is
`400 invalid_passkey_name`.

**(f) Deleting a passkey ends no session.** As ADR 0004 says, a passkey is a
way in, not the session itself. The dashboard session that deletes a passkey
carries on; a session opened on a lost device carries on too until it
expires or is revoked. "Sign out everywhere" belongs with session listing,
later.

## Consequences

- A `DELETE` with no body is exactly the request ADR 0005 put the Fetch
  Metadata line in front of; it is covered by where it is mounted.
- The API can remove a passkey but not add one to an existing account:
  registration creates an account, and there is no ceremony yet for a
  signed-in account to register another authenticator. The last-passkey
  rule therefore holds every account at its one registration passkey until
  that ceremony exists; it is the next ticket in this area, and the
  dashboard (#671) needs it for the "add a second passkey" nudge.
- The `insert_passkey` write that registration uses is what that ceremony
  will call; it is already visible to the crate, and the tests build accounts
  with two passkeys through it.
- A path segment that is not a uuid answers `400 invalid_path` in the
  `ApiError` shape, through a `Path` extractor wrapper next to the `Json` one.
- Rename is logged at `debug`, delete at `info`, with the passkey and account
  ids: removing a way into an account is worth a line.
