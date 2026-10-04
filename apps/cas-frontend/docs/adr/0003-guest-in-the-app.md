# 3. A guest in the app

## Status

Accepted (2026-10-04), with [#749](https://github.com/MemeBattle/monorepo/issues/749).
Amends ADR 0002 (e): "already signed in" means a full account. Builds on
apps/cas ADR 0015 (the guest upgrade) and ADR 0018 (`GET /api/me` under an
upgrade session).

## Context

A guest is an account an application minted for a player who never saw CAS
(apps/cas ADR 0014). To keep the game data, the player turns the guest into
a full account: the application sends the browser to `/oidc/authorize` with
the guest's ID token as `id_token_hint`, CAS opens an upgrade session and
sends the browser to `/create-account?return_to=…`, and a registration under
that session upgrades the guest instead of creating an account (apps/cas
ADR 0015 (d), (e)).

Until now the app could not tell a guest from a browser without a session:
under an upgrade session `GET /api/me` was a 401. That made create-account
reachable and the upgrade work unchanged, but the screen promised nothing
about the game data, and a guest who abandoned the upgrade and opened the
dashboard was shown sign-in. With apps/cas ADR 0018 `/api/me` answers the
guest, and the app has to decide what that means everywhere it reads the
session.

What was open:

- How the app knows the browser holds a guest.
- What the gate in front of sign-in and create-account does with a guest.
- What the upgrade screen is.
- What happens when the upgrade session ends while the screen is open, since
  the backend, not the request, chooses between an upgrade and a new account.
- What the dashboard shows a guest, and what guards it.
- Where the dashboard's way to an account leads.

## Decision

**(a) A guest is known from `/api/me`, never from the URL.** `accountType:
'guest'` is the signal (apps/cas ADR 0018 (c)). CAS sends a guest and a new
user to the same `/create-account?return_to=…`, and a parameter that said
"guest" would let any link choose the words the user reads, which ADR 0002
(g) already refuses for the application's name.

**(b) The gate keeps a guest on sign-in and create-account.** It is not
forwarded to `return_to`: CAS answers an upgrade session at `/oidc/authorize`
with create-account again, so forwarding would loop. It is not sent to the
dashboard either: these two screens are the guest's only way to an account.
The gate hands the guest's `Me` to the screen. "Already signed in" in ADR
0002 (e) means a full account. Sign-in stays open to a guest: signing in to
an existing account replaces the upgrade session, and the guest's data is
left behind by design (apps/cas ADR 0015 (d)).

**(c) The upgrade is the create-account screen with other words.** Same
route, form and ceremony, because the backend chooses by the session (apps/cas
ADR 0015 (e)) and needs nothing else from the screen. Only the subtitle
changes, to say that the game data stays.

**(d) A submit that promised to keep the data never becomes a new account.**
The session can end under the screen — the hour runs out, the guest is
upgraded or signs in in another tab — and the same requests would then
create an account. So the ceremony starts only when the challenge's user
handle is the guest's id: it is the one thing in the backend's answer that
says which path it took (apps/cas ADR 0015 (e)), and checking the answer
itself leaves no window between a check and the request. A finish that
answers `registration_not_found` is either an expired challenge or an upgrade
ceremony whose session is gone, so the screen reads `/api/me` again to tell
them apart; `unauthenticated` is a lost session. On a lost session the route
is revalidated, so the gate decides again (a full account is forwarded, no
session leaves the plain screen), and the screen says the guest's progress
cannot be kept from here. Rejected: reading `/api/me` before every ceremony,
which leaves a window between the check and the request and costs a request
on every submit; and a backend parameter that asks for an upgrade, which
apps/cas ADR 0015 (e) rules out to keep the bodies the same.

**(e) The guest dashboard is presentation.** The loader does not ask for the
passkeys, and the page shows the account type, the generated name and one
action. Passkeys, email and sign-out are absent, but what guards them is the
backend: every such request is a 401 under an upgrade session (apps/cas ADR
0015 (a)), and the UI is not relied on. No sign-out, because the issue asks
for a single action, and a guest that leaves has nothing to sign back in
with.

**(f) The dashboard's action carries no `return_to`.** The URL is the only
carrier (ADR 0002 (f)), and the request the guest came with is gone by the
time it opens the dashboard. The application sees the upgraded account, with
the same `sub`, at its next authorization request.

## Consequences

- The gate and the create-account screen read the account type on every
  navigation; nothing about the guest is stored client-side.
- This frontend must be serving before or with the backend of apps/cas ADR
  0018: an older one would forward a guest to `return_to` and loop
  (apps/cas ADR 0018 (e)).
- The e2e suite needs a confidential client that may mint guests, and its
  secret on disk (`e2e/seed.sh`, `docs/TESTS.md`).
- The copy is new and not yet on the design canvas; the written brief
  (`docs/DESIGN.md`) has it.
