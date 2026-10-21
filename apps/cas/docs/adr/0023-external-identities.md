# 23. External identities and the provider abstraction

## Status

Accepted (2026-10-21), with [#753](https://github.com/MemeBattle/monorepo/issues/753).
Follows ADR 0002's posture (two requests, one flow, nothing in memory) with
one deliberate divergence, recorded as (c). Amends ADR 0006 (c): the
last-passkey rule becomes a last-login-method rule, (g). Amends ADR 0004's
renewal: suppression is keyed to the session cookie's name rather than to the
presence of any `Set-Cookie`, (h). Adds two tables; no column of an existing
one changes.

No provider ships with this decision: Telegram is
[#754](https://github.com/MemeBattle/monorepo/issues/754), GitHub
[#759](https://github.com/MemeBattle/monorepo/issues/759), the development
mock [#760](https://github.com/MemeBattle/monorepo/issues/760). Listing and
unlinking an account's identities is
[#755](https://github.com/MemeBattle/monorepo/issues/755), the screens
[#757](https://github.com/MemeBattle/monorepo/issues/757) and
[#758](https://github.com/MemeBattle/monorepo/issues/758).

## Context

A passkey is the only way into an account today. The plan adds signing in
with an external provider, and linking one to an account that already exists,
starting with Telegram and then GitHub.

The two providers are not the same shape. Telegram is an OpenID Connect
provider with no userinfo endpoint: everything CAS learns about the person is
in the ID token the code exchange returns. GitHub is a plain OAuth 2
provider: the exchange yields an access token, and the person is a second
request away (`/user`). A third kind — a mock for development and end-to-end
tests — has no network at all. Whatever CAS builds has to fit all three
without the contexts around it knowing which one answered.

The flow spans two requests with the provider in between, and CAS is deployed
to Kubernetes as several replicas that scale automatically, so the redirect
out and the callback back may reach different instances. That is the problem
ADR 0002 already solved for a WebAuthn ceremony — state in Postgres, keyed by
a random id, single-use, expiry by the database clock — but with a difference
that matters: a ceremony's finish verifies the browser's answer inside one
transaction and can roll the consume back, while this finish has to make a
network call to the provider in the middle. A connection may not be held
across it (on a Worker a request has exactly one, ADR 0021), and a replay may
not be able to finish while the first exchange is still in flight.

Two intents share the dance. Signing in has no account yet and must end with
one and a session; linking has an account — the one the session names — and
must end with neither a new account nor a new session. Both start with the
same redirect and come back to the same address.

And an account may now hold zero passkeys: if an external identity is a way
in, refusing to delete the last passkey is refusing for the wrong reason.

## Decision

**(a) `external_identities` holds one row per identity, and an identity
belongs to exactly one account.** The row is `account_id`, `provider` (the
registry's slug, text rather than an enum: a provider arrives by deploying
code, not by migrating), `provider_subject` (the provider's own identifier
for the person), a profile snapshot — `profile_name`, `profile_username`,
`profile_picture_url`, as received and length-capped — and `linked_at`.
`UNIQUE (provider, provider_subject)`, named, so the repository maps the
violation to a domain conflict rather than letting a 23505 escape;
`ON DELETE CASCADE` from `accounts`, like every other row that belongs to an
account.

CAS does not merge accounts. `provider_subject` is written exactly as the
provider answered: it is the key an identity is found by, so it is validated
rather than repaired. An empty, whitespace-only or over-long subject is a
failed exchange (`400 provider_exchange_failed`), because trimming or cutting
one would map two of a provider's distinct subjects onto a single row —
`"alice"` and `" alice"`, or two subjects sharing the first 255 characters —
and the person who reached that row first would be the account the next one
signs in to. The unique constraint cannot see a collision CAS made before the
lookup.

The snapshot, unlike the subject, is data for a screen, never a credential
and never a label CAS holds to its own rules: it is length-capped as
received, and the account's display name is derived from it once, when the
account is created, and validated then. Two first sign-ins of the same unknown subject race at the
unique index; the loser rolls its provisional account back, looks the winner
up, and signs in to the winning account. A sign-in whose identity is proven
never fails over a race it can resolve.

**(b) A provider is two operations and a normalized identity.** The
`Provider` trait builds an authorization URL from the redirect URI, the
`state` and a PKCE challenge, and exchanges a code for a
`NormalizedIdentity { subject, profile }`. Nothing else is asked of it, and
how it gets there — an ID token it verifies, a token plus a `/user` call, a
value from memory — is the implementation's. Implementations own their
outbound calls, so no HTTP client is a dependency of the context. The trait
is dyn-compatible (the registry holds `Arc<dyn Provider>`), which is why the
exchange returns a boxed `Send` future rather than being an `async fn`; axum
requires `Send` on both of the crate's targets.

CAS generates the PKCE pair, S256 only, and keeps the verifier in the flow
row. A provider without PKCE ignores the challenge; CAS does not have a
second code path for it.

The registry is a map of slug to provider, built once at startup. This
release builds it empty, so every start answers `404 unknown_provider` until
a provider registers.

**(c) Flow state lives in `external_identity_flows`, and the `state`
parameter is the row's id, consumed by one auto-committed delete-on-read
*before* the exchange.** The row carries the provider, the intent, the PKCE
verifier, the hash of the browser secret (d), the account for a link, the
`return_to`, and an `expires_at` ten minutes out plus a grace period,
measured by the database clock so every replica agrees. A row past it is
ignored and left for the scheduled cleanup; nothing is ever swept on the
request path (ADR 0002 (d)).

This is ADR 0002 (b) and (d) unchanged, and ADR 0002 (c) deliberately
reversed. The consume commits on its own, before the provider is asked, so a
replayed `state` finds nothing even while the first exchange is in flight.
The price is that an exchange or a write that fails afterwards leaves the flow
spent and costs the person a restart. The alternative would either hold the
row — and a connection — across a network call, which a Worker cannot do, or
leave a window in which one `state` finishes twice. Flows are cheap to start;
a second sign-in is not a lost account.

The finish therefore runs in four phases, none of which holds a connection
across another's work: consume (one statement, guard dropped), validate (no
connection held), exchange (no connection, no lock), write. Session issuance
is delegated to `SessionService`, which acquires for itself, so the write
phase gives its connection back before calling it (ADR 0021).

**(d) A flow is bound to the browser that started it by a one-time cookie
whose hash is in the row.** The start endpoint answers with the authorization
URL and sets `cas_identity_flow` (`__Host-` prefixed on an https origin),
HttpOnly, `SameSite=Lax`, living as long as the flow. The callback compares
the SHA-256 of what it was presented with the row's `browser_hash`, in
constant time; a missing, malformed or mismatched cookie is
`400 foreign_flow`.

That is both halves of what the ticket and RFC 9700 ask for: a `state` minted
for another browser, or for none, cannot finish a flow, which is the
login-CSRF defence every provider inherits without implementing it.

The cookie is cleared only by an answer that consumed the flow it is bound
to: the success and every failure past that comparison. A browser holds one
flow cookie at a time, so an answer that consumed nothing — `flow_not_found`,
or `foreign_flow`, where the row taken was not this cookie's — would be
clearing whichever flow the browser is currently running. Otherwise any
navigation to the callback, an old tab reloaded or a link on someone else's
page, would spend a live flow's cookie and leave its own callback answering
`foreign_flow`.

**(e) Two intents on one callback, read from the row and never from the
URL.** `sign_in` finds the identity's account or creates a full one;
`link` attaches the identity to the account the flow was started for. The
redirect URI a provider registers therefore stays one stable address per
provider, `{issuer}/identities/{provider}/callback`, whatever the person was
doing.

A new account's display name comes from the snapshot through a fallback
chain: the provider's name, then its handle, then a fixed valid default. Each
candidate is tried through `DisplayName`'s rules, because a provider's string
is not a label CAS can trust — an invisible character, a direction change, a
name past the cap. The raw values stay in the snapshot columns regardless:
they are data, not labels.

The callback path is per-provider rather than one shared address, so a
`state` arriving on the wrong provider's path is structurally detectable; it
answers `flow_not_found`, like any other `state` that names no flow this
request may finish.

**(f) A link finishes only under a session naming the flow's account.** The
addition-ceremony rule of ADR 0006 (g), applied to flows: a browser that
signed out and in as someone else between the two requests may not attach the
identity to whoever it is now. Without such a session the answer is
`403 link_session_mismatch`, and the flow is spent all the same. An identity
that is already on an account is `409 identity_already_linked` for a link — a
conflict stays a conflict — while for a sign-in the same state of the world
is simply the account to sign in to (a).

**(g) The last-passkey guard counts login methods, under the account's row
lock.** Deleting a passkey is refused only when it is the account's last one
*and* the account has no external identity. The transaction takes
`accounts::lock` first and then the passkey rows: the account row is where
every login-method change serialises, so #755's unlink and this delete cannot
both pass by counting different tables. ADR 0006 (d)'s reasoning is
unchanged, one lock earlier.

The wire code stays `409 last_passkey`. cas-frontend's generated client and
its dashboard branch on it, and renaming it would break them for no
user-visible gain; the rename belongs with the frontend work that teaches
them about identities (#758). The message changed, and now names both
remedies.

**(h) Starting a flow is an `/api` call; finishing one is a navigation at the
root.** `POST /api/identities/{provider}/sign-in-options` (anonymous) and
`POST /api/identities/{provider}/link-options` (`Authenticated`) answer
`{ url }` and set the flow cookie; being nested under `/api` is what gives
them the Fetch Metadata line, `no-store` and the `ApiError` shape.
`GET /identities/{provider}/callback` is a top-level navigation from the
provider, which is exactly what that line refuses, so it is mounted at the
root beside `/oidc/authorize` and answers as that endpoint does: a `302` to
the frontend at the flow's `return_to` on success, CAS's own fixed-string
error page with a stable code on failure, `405` for a `HEAD`. `return_to` is
validated as a path — it must start with `/` and may not begin another
authority — so a flow can never redirect the browser off the frontend's
origin. Its length bound is derived from what `/oidc/authorize` itself
accepts (`MAX_STATE_LENGTH` + `MAX_NONCE_LENGTH`, plus room for the rest of a
request), because the continuation that endpoint hands to the frontend is the
longest `return_to` CAS produces: a bound below it would refuse a sign-in for
a request CAS had just accepted.

The page family and the plain `302` move to the transport root
(`http::page`), because two contexts now have endpoints a browser navigates
to and a browser must meet one answer, not one per context. Each context
still declares its own pages' text and codes.

Session-cookie renewal rides along: the callback is wrapped in the renewal
layer and resolves the session before consuming the flow, so a link knows
whose session it is and a due renewal reaches the browser. For that to work
the layer's suppression had to change from "the response has no `Set-Cookie`"
to "the response sets no cookie under the session cookie's name". A handler
that sets or clears the session cookie still wins unchanged; a handler that
sets only an unrelated cookie — the flow cookie — now gets the renewal
appended beside it. Without the change, starting a flow would have renewed
the row and dropped the cookie, leaving the browser's `Max-Age` behind the
server's.

## Consequences

- Any replica can finish any flow, and a pod restart loses nothing.
- A provider hiccup after the consume costs the person a restart, by design
  (c). The flow row is gone, so there is nothing to clean up and nothing to
  replay.
- A sign-in that opens no session because session creation failed after the
  identity committed leaves an account and an identity behind. The next
  sign-in takes the hit path and signs in; nothing is orphaned beyond a
  retry, and nothing is swept on the request path.
- The anonymous start endpoint can write flow rows at will, like
  `/register-options` before it. Rate limiting stays the ingress's job
  (ADR 0002's Consequences); the index on `expires_at` is there for the
  cleanup job.
- `external_identity_flows` and `external_identities` both grow by one row per
  abandoned flow and per link. At CAS's scale that is acceptable until the
  scheduled cleanup exists.
- An account can now exist with no passkey (g), so "a full account" no longer
  implies "has a credential". Nothing reads it that way: `AccountType` says
  whether the person chose an identity, not which credential they hold.
- The flow cookie is a second cookie CAS sets, so the renewal layer can no
  longer treat "a cookie went out" as "the session was answered for" (h).
  Any future endpoint that sets a cookie of its own inherits the fixed
  behaviour.
- `openapi.json` gains three operations, and cas-frontend's generated client
  is regenerated with it (`apps/cas-frontend/docs/TESTS.md`). No screen uses
  them yet: #757 and #758 are where they appear.
- The one-time-cookie binding means a flow started in one browser cannot be
  finished in another — including the case of a person who starts on a phone
  and opens the provider's link on a laptop. That is the intended refusal, and
  it is what the error page says.
- A fake provider in the tests drives both intents end to end with no network,
  so the machinery is exercised before the first real provider exists. It
  records the verifier it was handed, which is how the tests show PKCE
  round-tripping through the flow row.
