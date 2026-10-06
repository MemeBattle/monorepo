# 15. Guest upgrade via id_token_hint

## Status

Accepted (2026-10-03), with [#747](https://github.com/MemeBattle/monorepo/issues/747).
Builds on ADR 0002, ADR 0012 (h) and ADR 0014. Amends ADR 0004 (sessions
have a kind, and only a full session passes the `Authenticated` extractor;
(f): the upgrade writes its session inside the ceremony's transaction) and
ADR 0010 ((b): `id_token_hint` is served; (c): a second destination,
`create-account`).

## Context

A guest (ADR 0014) is an account a confidential client minted for a user
who never saw CAS. PLAN promises that the user can later create a real
account without losing what the application keeps under the guest's `sub`:
the guest becomes a full account in place. The application sends the
guest's browser to `/authorize` with a fresh ID token of the guest as
`id_token_hint`; ADR 0010 (b) refused that parameter "until #747". ADR 0012
(h) wrote `revoke_account_grants` for this ticket, and ADR 0014 (b) left
`created_by_client_id` to survive the upgrade.

The upgrade is a privilege change, and the issue names the threat: session
fixation. An attacker opens an upgrade session for a guest, hands the
upgrade link to a victim, the victim registers a passkey, and the
attacker's session — or refresh token — now names a full account and could
add a passkey of its own. What was open:

- What an upgrade session is, how it differs from a session that signed in,
  and who enforces the difference.
- What makes a hint acceptable, how a refused one is answered, and what a
  hint for a full account means.
- How `/authorize` combines a hint with whatever session the browser holds.
- How the registration ceremony knows it is upgrading a guest rather than
  creating an account.
- What finishing the upgrade does, in what order, and what a second browser
  racing it sees.
- What the database needs to find an account's pending ceremonies.

## Decision

**(a) Two session kinds, and the backend denies by default.**
`sessions.kind` is `full` (registration, login) or `upgrade`. The
`Authenticated` extractor admits `full` only; an upgrade session is answered
with the same `401 unauthenticated` as no session (ADR 0004 (g)), with a
warning that names the session row and the path. Every endpoint behind the
extractor — passkey addition, listing, renaming and deletion, the email,
`GET /api/me` — is therefore closed to an upgrade session, and so is every
endpoint added later, without anyone having to remember. What is open is
exactly two things, both of which read the session themselves: the
account-registration ceremony, for the session's own account (e), and
`/authorize`, which sends an upgrade session to create-account and never
gives it a code (d). Logout ends an upgrade session like any other: ending
a session is not a use of it. The backend and not the UI, because the
attacker of the fixation threat drives the API directly; a screen that
hides a button protects nobody. `GET /api/me` is closed too, as the
issue's "everything else" says, although the frontend may want it for a
guest (see Consequences).

**(b) An upgrade session is live only while its account is a guest, and for
one hour.** `authenticate` refuses an upgrade session whose account is no
longer a guest. The finish (f) deletes every session of the account, but a
`/authorize` racing it could insert a new upgrade row right after the
commit; this rule makes such a row worthless whatever the timing, which is
why it sits in the one function every request passes. One hour
(`UPGRADE_SESSION_LIFETIME`), not the month of a full session, because the
session was opened by a credential that travelled in a URL: a hint good for
ten minutes must not turn into a month-long session for whoever saw the
link. An hour is enough to register a passkey. The cookie's `Max-Age`
follows, as it follows any session's cap.

**(c) What a hint must be, and how a refused one is answered.** A hint is
accepted when it is an ID token signed by a published key (ADR 0013 (a)),
with `typ: JWT`, `iss` equal to `CAS_ISSUER`, `aud` equal to the client
making the request, and `exp` after now by CAS's clock, no leeway (ADR 0011
(e)). Expiry matters here and not at logout (ADR 0013 (f)) because this
hint opens a session: it is a bearer credential, and the issue makes the
confidential client refresh before it builds the link. The account's type
comes from the row, not from the token's `account_type` claim, which is up
to ten minutes old. A hint of a full account, or of an account that no
longer exists, is ignored: the request continues as if none had been sent.
A hint that fails any rule is refused through the redirect URI with
`invalid_request` and one of two fixed descriptions, `id_token_hint is
invalid` or `id_token_hint has expired`, and nothing is opened. RFC 6749
§4.1.2.1 has no closer code and OpenID Connect Core defines none for a bad
hint; the client's remedy is the same either way — refresh, build the link
again — and the two descriptions tell an integrator which happened. A hint
that is sent is checked whatever the session is: a client that sent one is
told when it is broken, rather than finding it silently ignored.

**(d) Session and hint at `/authorize`.** After the request is validated
and the hint judged:

- A full session wins. The code is for the signed-in account, and the hint,
  valid or ignored, is dropped. A link never trades a signed-in account for
  a guest; this is also the "guest signs in to an existing account" case,
  where the guest stays a guest and its data is lost, by design (PLAN).
- Otherwise the account to upgrade is the hint's guest, or failing that the
  guest of an upgrade session the cookie carries — a reload, or the
  frontend following `return_to` before the ceremony finished. With one,
  the browser goes to `302 {CAS_ORIGIN}/create-account?return_to=...`,
  under the cookie's upgrade session when it is that guest's, or under a
  new one opened here and set on the redirect. Without one, today's
  anonymous path.
- `prompt=none` with an account to upgrade is `login_required`: registering
  a passkey is UI, which the client promised not to show.
- An upgrade session never gets a code.

`return_to` leaves `id_token_hint` out whenever one was sent, for both
destinations: once judged, the hint has done its work, it should not
travel on into the frontend's URL, and the request the frontend returns to
must not fail on a hint that expired while the user was registering or
signing in. A request without a hint keeps `return_to` as sent, byte for
byte (ADR 0010 (c)).

**(e) The upgrade is a ceremony kind of its own, on the registration
endpoints, chosen by the session.** `POST /api/webauthn/register-options`
and `/verify-registration` keep their bodies; a request that carries an
upgrade session runs the upgrade, any other an account registration. No
parameter selects it, so a client cannot ask for an upgrade it holds no
session for, and the existing create-account screen works unchanged. The
WebAuthn user handle is the guest's id rather than a fresh one: the handle
is baked into the credential and is what discoverable login signs in (ADR
0003 (a)), so this is what keeps the `sub`. The ceremony is stored as kind
`upgrade` with the guest's id and the chosen name, and the finish checks
both: the kind, so a registration cannot be finished as an upgrade or the
other way round (ADR 0002), and the account, so another account's session
cannot finish it — a mismatch consumes the ceremony and answers not found,
as for a passkey addition (ADR 0006 (g)). The guest has no credential, so
nothing is excluded.

**(f) The finish is one transaction under the account's row lock.** In
order:

1. Lock the account `FOR UPDATE`. A missing account or one that is not a
   guest is `401 unauthenticated`: the upgrade session has nothing left to
   upgrade.
2. Consume the ceremony (e).
3. Verify the answer; a wrong one commits the consumed ceremony and changes
   nothing else.
4. Store the passkey.
5. Make the account full, with the chosen name; `created_by_client_id`
   stays (ADR 0014 (b)).
6. Delete every session of the account, and write a full one for this
   browser. If the upgrade session was not among the deleted rows it was
   revoked meanwhile, and everything rolls back with `401 unauthenticated`.
7. Revoke every grant of the account (ADR 0012 (h)), and with it every
   refresh token.
8. Delete every other pending ceremony of the account.

Each step answers part of the threat. The attacker's upgrade session, or
any other the account had, is gone by 6, and (b) holds for a row inserted
after; its refresh tokens die at 7; a challenge it started for the same
guest dies at 8. Only the browser that completed the ceremony holds a live
session. A second browser racing the same upgrade waits at 1, then finds a
full account and gets `401 unauthenticated`, with nothing written.

The lock is taken first and everything else belongs to the account, so
there is one lock order. `FOR UPDATE` rather than `FOR NO KEY UPDATE`: an
insert that references the account — a session a racing `/authorize`
opens, a grant — takes `FOR KEY SHARE` on its row and so waits for the
commit instead of slipping in beside it. Refresh rotation locks the grant
and not the account, and a guest has no codes, so no transaction takes
these locks the other way round. The new session token is drawn before the
transaction opens, and the session events are logged after the commit
(ADR 0004 (j)).

The session is rotated inside the ceremony's transaction, unlike ADR 0004
(f), where registration and login write theirs after the commit. There,
a failed session write leaves a signed-up account that signs in again.
Here, an account that is upgraded while the browser still holds an upgrade
session — or holds none — must not be observable: the upgrade session
would be refused by (b), and the browser would be stranded with an account
it cannot use until it signs in with the passkey it just made.

**(g) `webauthn_ceremonies.account_id`.** A nullable column with a foreign
key to `accounts` (`ON DELETE CASCADE`) and a partial index on the non-null
rows: the existing account a ceremony is bound to, set for an addition and
an upgrade, `NULL` for a registration, whose account does not exist yet,
and for a login, which names none. Step 8 deletes by it. Reaching into
`state` jsonb instead would tie a delete to the serialised shape of every
ceremony kind, which ADR 0002 allows to change under a rollout, and would
scan the table; the column costs one write on start. The cascade removes an
account's ceremonies with it.

**(h) Accepted windows, and the rollout.** Access and ID tokens already
issued to the guest stay valid until their `exp`, at most ten minutes, and
still say `account_type: "guest"`; resource servers keep trusting the
claim (PLAN, the issue). A leaked hint lets a stranger take the guest over
within its ten minutes; the owner loses that guest's data, which PLAN
accepts. An instance of the previous release does not know `kind`, so it
would treat an upgrade session as a full one and open every endpoint to
it: guest-enabled clients stay off until every serving instance runs this
release, as ADR 0014 already requires for its own reason. Both migrations
are additive.

## Consequences

- `/authorize` serves `id_token_hint`; discovery needs no change. Two
  migrations: `sessions.kind` (enum `session_kind`, default `full`), and
  the `upgrade` value of `webauthn_ceremony_kind` with
  `webauthn_ceremonies.account_id` and its partial index. `.sqlx` changes
  for the session insert and lookup and the ceremony insert, and gains the
  account lock, the guest update, and the two account-wide deletes.
- The frontend (#748, #749) gets `create-account?return_to=/authorize?...`
  and must follow `return_to` after the ceremony, as after sign-in. Under an
  upgrade session `GET /api/me` is a 401, so a browser holding one looks
  signed out to the frontend: today's create-account screen is reachable
  and runs the upgrade unchanged, but a guest dashboard (#749) that wants
  to show the account type needs a decision of its own — opening `/api/me`
  to an upgrade session would be one place to change. The UI must not rely
  on hiding anything: the 401s are the guarantee.
- The reference client test (#750) can exercise the whole path: guest
  grant, hint, registration, code, tokens with the same `sub`, and the old
  refresh token refused.
- The scheduled cleanup, when it is written, removes expired upgrade
  sessions like any other, and expired ceremonies of every kind, now with
  an `account_id` to delete by when an account goes.
- The integration guide (#751) must say that the hint is a fresh ID token,
  refreshed just before the link is built; the two `invalid_request`
  descriptions; that the `sub` stays; that the guest's refresh tokens are
  revoked by the upgrade, so the application signs in again through the
  code it receives; and that access tokens already out say `guest` until
  they expire.
