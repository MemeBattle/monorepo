# 3. Passkey login

## Status

Accepted (2026-09-12), with [#666](https://github.com/MemeBattle/monorepo/issues/666).

## Context

Registration (ADR 0001) stores a discoverable credential whose user handle is
the account id. Login has to turn a browser assertion into a signed-in account
without asking for a username or email: the challenge goes out without
`allowCredentials`, the authenticator picks a credential for the relying party,
and the assertion names both the credential and the account.

The assertion's signature covers the authenticator data and the client data,
not the user handle. The handle is a claim, and CAS must decide how much of it
to trust. The signature counter is the WebAuthn signal for a cloned
authenticator, and the library decides what a counter that did not advance
means; CAS decides what to persist and when.

## Decision

**(a) The credential row is the authority; the user handle must agree with
it.** Login looks the credential up by the id in the assertion and reads the
account id from the row. The user handle is checked against that id and the
login is refused if they differ. This is the check from
[WebAuthn §7.2 step 6](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion)
for a challenge without `allowCredentials`, and it is what stops a tampered
handle from signing a different account in with someone else's key.

**(b) Every refusal is one 401 with one code, `invalid_credential`.** A
credential CAS never stored, a handle that names another account, a signature
that does not verify, a counter that went backwards: the client sees the same
status and the same message. The reason is logged at `warn` with the login and
credential ids. A caller probing which credential ids exist learns nothing from
the response. A consumed or unknown ceremony stays a 404 (`login_not_found`),
because that is the client's cue to start over, not a statement about any
credential.

**(c) A refused assertion consumes the ceremony.** The same rule as
registration (ADR 0002 c): a challenge is answered once, right or wrong, so the
deletion of the ceremony row is committed on refusal. A failed write rolls
everything back and the ceremony survives for a retry.

**(d) The credential row is locked for the finish.** `SELECT ... FOR UPDATE`
on the credential serialises two concurrent logins with the same key, so the
second one verifies against the counter the first one wrote, not the value
both started from. Without it two assertions could both pass and the higher
counter could be overwritten by the lower one. The lock spans a signature
check and one update; contention is per credential and negligible.

**(e) The verifier's view of the credential is written back on every login.**
webauthn-rs reports the new counter and backup flags; CAS hands them to
`Passkey::update_credential` and stores the whole credential again, together
with `last_used_at`. The row is written even when nothing in the credential
changed, because `last_used_at` moves on every login. A counter that does not
advance is refused by the library (`CredentialPossibleCompromise`) and nothing
is written, so the stored credential is exactly as it was before the attempt.
CAS does not lock or flag the credential on that signal: the user's other
credentials still work, and what to do about a suspected clone is a product
decision left to passkey management (#668) or later.

**(f) The challenge is issued as the library issues it.** webauthn-rs marks a
discoverable challenge for conditional mediation. That is a hint to the client:
the same options run through a modal prompt (`navigator.credentials.get`
without `mediation`) or through browser autofill, and the frontend (#670)
chooses per screen. CAS does not vary the challenge by how the client intends
to show it.

## Consequences

- `POST /api/webauthn/login-options` takes no body. There is nothing to send:
  the challenge is the same for everyone.
- `POST /api/webauthn/verify-login` answers with the account id and the
  credential id. A session (#667) will accompany the answer; until then the id
  is all the client learns, and it is not yet proof of anything to another
  service.
- `accounts.last_seen_at` is not touched by login. Sessions (#667) are the
  activity that refreshes it.
- The `conditional-ui` feature of webauthn-rs is now a regular dependency,
  not a test-only one.
- Tests cover the wire shape of the challenge, a login with the credential
  read back from Postgres, the counter advancing and being refused when it
  does not, an unregistered credential, a tampered and a missing user handle,
  an answer to another challenge, a registration id used as a login id, and
  the ceremony being consumed on every refusal.
