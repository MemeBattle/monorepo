# 14. Guest accounts and the guest grant

## Status

Accepted (2026-10-03), with [#746](https://github.com/MemeBattle/monorepo/issues/746).
Builds on ADR 0002 (d), ADR 0008 (d), ADR 0011 (b), (d), (f) and (g), and
ADR 0012. Amends ADR 0011 (the guest grant is served, with two errors of its
own) and ADR 0013 (c) (`name` is released for a full account only).

## Context

A user of ligretto starts before they have an account: today the legacy
backend hands out a `temp-token` without any UI. PLAN keeps that shape for
CAS. A guest is an ordinary `accounts` row of `type = guest`, so the tokens,
userinfo and the later upgrade to a full account (#747) have one code path,
and the application's backend mints it through an extension grant at
`/token`. Discovery has advertised `urn:memebattle:oauth:grant-type:guest`
since ADR 0009, `accounts.type` and the `guest` enum value exist since the
accounts migration, `clients.guest_login_allowed` since ADR 0008 (d), and
`grants.authorization_code_id` was left nullable by ADR 0011 (d) for a grant
no code produced. What was open is everything the grant itself decides.

- Who may mint a guest, and what the refusal is.
- What a guest row holds: `display_name` is `NOT NULL`, and a guest has
  chosen no name; which client minted it is not recorded anywhere.
- What the grant is without a code and without a CAS session, and how long
  it lives — PLAN left "guest grant lifetime" to this ticket.
- Which scopes a guest gets when the client names none.
- How minting is limited. Every first visit in a new browser mints a guest,
  and nothing collects them yet, so a client that mints in a loop fills the
  table. CAS runs as several stateless replicas, so a limit cannot live in
  one process's memory.
- What collecting guests later can rely on.

The owner decided three of these before the plan: the display name column
keeps `NOT NULL`; a guest's grant lives the same thirty days as any other;
the limit is a column of the client row. After reading the first
implementation, which stored one fixed placeholder for every guest, the
owner asked for a distinct generated name per guest instead; (b) records
that revision.

## Decision

**(a) A guest is minted at `/token` by an extension grant, by the
application's backend, and only by a confidential client with
`guest_login_allowed`.** `POST /token` with
`grant_type=urn:memebattle:oauth:grant-type:guest` (RFC 6749 §4.5) and an
optional `scope`. The client authenticates exactly as for the other grants,
and first (ADR 0011 (f)). Then, before any parameter of the grant is read,
the client must be confidential and carry the flag; anyone else
authenticated — a public client with the flag included — gets `400
unauthorized_client`, which RFC 6749 §5.2 defines for exactly this: an
authenticated client that may not use the grant type. Confidential only,
because a public client cannot prove who it is: its id is public, so the
flag on it would let anyone who reads the id mint accounts. ADR 0008 (d)
left the flags independent of the kind and registration still accepts the
combination; the grant is where it is refused.

**(b) What a guest row is.** `type = guest`, no credentials, no email, and
`accounts.created_by_client_id`, the client that minted it, with `ON DELETE
SET NULL`. The column is provenance, not ownership: it stays when a guest
is upgraded (#747), so deleting a client must not delete accounts that may
belong to people by then, which `CASCADE` would. It is `NULL` for an
account created through CAS's own UI.

`display_name` stays `NOT NULL`, and every guest gets a name of its own,
generated when it is minted: `Guest <n>`, `n` drawn from the Postgres
sequence `guest_display_name_seq` (owner's decision). So two guest rows are
told apart wherever CAS shows the column — its own screens, an operator
reading the table — rather than all reading `Guest`. A sequence because it
is shared by every replica, never hands out a value twice and takes no
lock; the number is drawn in the mint's transaction once the rate limit (e)
has let the mint through, so a refused request spends none, and the gap a
rolled-back mint leaves is harmless. The name is built and validated as a
`DisplayName` in the accounts context, like any other. There is no UNIQUE
constraint or index on the column: display names of full accounts are
deliberately not unique (PLAN), a constraint over guests alone would buy
nothing the sequence does not already guarantee, and an index would cost
every account insert.

The generated name is still not a name the guest chose, so it is never
released: the `name` claim is absent from a guest's ID token and from its
`/userinfo` answer, even with `profile` granted. The ticket's
"`id_token.name` is null" is read as absent, which is what OpenID Connect
Core §5.3.2 asks of a claim that is not returned, and how `email` is
already handled. One accessor, `Account::chosen_name`, knows that a
guest's column is not a chosen name; the claims read the name through it.
A nullable column was weighed and rejected by the owner: it changes `/me`,
passkey addition and the frontend's account type.

**(c) The grant: no code, no session, the common lifetime.** The grant row
has `authorization_code_id` `NULL`, and its first refresh token is written
with it, as for a code exchange (ADR 0011 (d)). No CAS session is created:
the guest never sees CAS, and nothing would ever present its cookie. The
grant lives the same absolute thirty days as every grant
(`REFRESH_TOKEN_LIFETIME`, ADR 0011 (c)), which the owner confirmed; this
closes PLAN's "guest grant lifetime". So a guest identity can be refreshed
for at most thirty days from its minting unless it is upgraded (#747): that
is the absolute lifetime of the refresh grant, and the access and ID tokens
of the last refresh stay valid for up to ten more minutes, which `/userinfo`
honours (ADR 0013 (b)). Refreshing a guest needs nothing new: rotation is
account-type agnostic (ADR 0012), and a guest's activity is its grant's
`last_used_at`; `accounts.last_seen_at` is not moved. The tokens carry `amr:
["anon"]` and `account_type: "guest"` (ADR 0011 (b)), and the ID token has
no `nonce`, since there was no authorization request to take one from.

**(d) Scope.** Optional. Omitted, it is `openid` alone; present, it must be
well formed, include `openid`, and stay inside the client's allow-list,
otherwise `invalid_scope` with a fixed description. The default is checked
against the allow-list too. Not the whole allow-list by default: a guest
has no name and no address, so `profile` and `email` would promise claims
that never come; a client that wants them for the upgraded account asks
when it upgrades.

**(e) A rate limit per client, in the client row, counted in Postgres, and
exact.** `clients.guest_grants_per_minute` (default 60, positive by a CHECK)
caps how many accounts a client mints in any sliding minute, counted over
`accounts.created_at` for its `created_by_client_id`. In the database,
because CAS runs as several stateless replicas: an in-memory counter would
be per replica, and the real limit would be the number times the replica
count. In the row, because applications differ, and the number then changes
without a release. `cas-client register --guest-grants-per-minute` sets it,
and only next to `--guest-login-allowed`: a limit for a grant the client may
not use is a mistake. The answer past the limit is `429` with
`rate_limit_exceeded` and `Retry-After: 60`: RFC 6749 §5.2 defines no code
for it, and an extension grant may define its own. It counts the accounts
minted, whatever their type now, so an upgraded guest still counts for its
minute.

The limit is exact under concurrency. The mint's transaction first locks
the client's row with `SELECT ... FOR NO KEY UPDATE`, in a statement of its
own, and holds it to the commit; then counts; then inserts. Two mints of one
client are therefore serialised across every replica, and the second one's
count, a new statement, sees the first one's committed account. A count
without the lock was rejected: under READ COMMITTED, racing requests do not
see each other's uncommitted inserts, so all of them pass at the boundary,
and the overshoot grows with the number of replicas. `FOR NO KEY UPDATE`
rather than `FOR UPDATE`: an insert into `grants` or `accounts` that
references the client takes `FOR KEY SHARE` on its row, which conflicts
only with `FOR UPDATE`, so the client's code exchanges and refreshes are
never queued behind a guest mint. The price is that a client's guest mints
run one at a time; each is a count and three inserts, and the limit caps
their rate anyway. The lock order is the client row first, then only rows
the transaction creates, so there is nothing to deadlock with.

The window is measured with `statement_timestamp()`, both for the count's
cutoff and for the new account's `created_at` and `last_seen_at`, in
statements sent after the lock is held. Not `now()`: it is the start of the
transaction and stays frozen while the transaction waits for the lock, so a
mint that waited would count against a window that ended when it started
waiting and stamp its account in the past. Not `clock_timestamp()`: it is
volatile, so the planner cannot use the range as an index condition, and
since nothing collects guests yet (g) the count would read the client's
whole history; `statement_timestamp()` is stable, and the count is a range
scan of `accounts_created_by_client_id_created_at_idx`, which a test pins.
It is still the database clock (ADR 0002 (d)). Every account insert takes
its timestamps this way, so there is one insert for every account type; for
a full account the difference from `now()` is a few milliseconds.

**(f) One transaction.** The lock, the count, the account, the grant and
its first refresh token are one transaction: a guest without its grant, or
a grant without its token, is never visible, and a refusal or a database
failure leaves nothing behind. The refresh token is drawn before the
transaction opens, as for the other grants. Nothing is swept there: expired
rows are a scheduled job's business (ADR 0002). The log line names the
grant, the client and the account, never a token.

**(g) Collecting guests is deferred, and its rule is not decided here.** It
stays an open question in PLAN. What a future policy can read is recorded:
`grants.last_used_at` (moved by every refresh), whether the guest still has
a live grant, `accounts.created_at` and `created_by_client_id`. Which guests
are eligible is left to the ticket that writes the job, because it has to
weigh what this ticket cannot see yet: access and ID tokens still
outstanding after a grant ends, upgrade sessions and pending ceremonies of
#747, and data an application keeps under the `sub`.

## Consequences

- `grant_type=urn:memebattle:oauth:grant-type:guest` is served; discovery
  already advertised it. `unsupported_grant_type` names the three grants,
  and `unauthorized_client` and `rate_limit_exceeded` (`429`, `Retry-After`)
  join the endpoint's errors.
- A migration adds `accounts.created_by_client_id` with a partial index on
  `(created_by_client_id, created_at)`, and
  `clients.guest_grants_per_minute`, defaulted so the previous release's
  `cas-client` still registers clients. A second migration creates the
  sequence `guest_display_name_seq`; nothing constrains
  `accounts.display_name`. `.sqlx` gains three queries — the count, the
  client lock and the sequence draw — and four change: the account insert
  and lookup, the client insert and lookup.
- `cas-client register` takes `--guest-grants-per-minute <n>`. A client
  registered before keeps the default; there is no update path until the
  admin panel (ADR 0008), so changing the number of an existing client is a
  new registration or a manual `UPDATE`.
- Rollout: an instance of the previous release refreshes a guest's grant
  and answers its `/userinfo` with the generated `Guest <n>` as `name` when
  `profile` was granted, because it does not know the rule in (b). A client is given
  `guest_login_allowed` only once every serving instance runs this release.
  CAS has no guest-enabled client in production yet.
- #747 builds on this: it reads the name through `Account::chosen_name`,
  replaces the generated name with the one chosen at upgrade, keeps
  `created_by_client_id`, and revokes the guest's grants with
  `revoke_account_grants` (ADR 0012 (h)).
- The integration guide (#751) must tell an integrator that a guest's
  refresh grant ends thirty days after it was minted, so the application
  offers the upgrade before then or mints a new guest, and that a `429`
  from the guest grant is retried after `Retry-After`.
- Deferred: guest GC (g), and refusing `guest_login_allowed` on a public
  client at registration.
