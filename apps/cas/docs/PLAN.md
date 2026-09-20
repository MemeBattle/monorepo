# CAS v2 — Plan

Umbrella issue: [MemeBattle/monorepo#548](https://github.com/MemeBattle/monorepo/issues/548).
This is the living planning doc; decisions land here first, tickets are cut from it.

## Vision

CAS is the single Identity Provider for the MemeBattle ecosystem, replacing the
legacy [my-cas](https://github.com/MemeBattle/my-cas) (Node.js, MongoDB, Redis,
email/password + VK login, 7-service architecture).

- **Passwordless.** No password system at all; passkeys (WebAuthn) are the primary
  authentication method. External providers (Telegram, GitHub, ...) are additional
  login methods and linked identities, never passwords.
- **Agent-friendly.** A user signs in with a passkey and can delegate scoped,
  revocable, auditable access to an agent that has its own identity. An
  agent's request reaches the user for approval through one of the user's
  linked channels; a linked Telegram account is the first such channel, not
  the only one.
- **Stack:** Rust (axum), PostgreSQL, S3 for files (filesystem backend in dev).
- **Process: "lit factory"** — the agent writes the code, the human understands
  every change. Small, reviewable increments.

## Key decisions

**Authentication & UX**

- Registration and authentication remain separate WebAuthn ceremonies on the
  backend, but the frontend has a single entry screen: conditional-mediation login
  via discoverable credentials (no identifier asked) plus an explicit
  "create account" path.
- Registration asks only for a display name and requires discoverable
  credentials (`residentKey: required`, `requireResidentKey: true`) plus user
  verification. Unsupported authenticators must fail registration; there is no
  identifier-first fallback. See ADR 0001.

**Identity**

- Account id is a uuid (OIDC `sub`). Display name is non-unique; no unique
  username in v1 (an optional "claim your handle" feature may come later if a
  product need appears).
- Email is optional and stored unverified in v1: it is the future recovery anchor.
  The dashboard nudges the user to add it. Verification flow arrives with the
  email milestone.
- An account created through an external provider may have zero passkeys. The
  "last passkey cannot be deleted" rule generalises to "the last login method
  cannot be deleted" once providers exist.

**Recovery**

- No recovery mechanism in v1. We rely on synced passkeys and nudge the user to
  add a second passkey. Magic-link recovery ships together with email
  verification. No recovery codes. Provider-only accounts recover through the
  provider.

**Guest (temporary) users**

- Preserved from the legacy CAS (ligretto depends on them) and stored in the DB:
  a guest is a normal account row (`type = guest`, same uuid `sub`) with no
  credentials and a `created_by_client_id`. One code path for guests and full
  accounts (grants, refresh rotation, userinfo).
- Opening ligretto must keep working with no click and no redirect, as the legacy
  `temp-token` does. Guests are therefore minted by the application's backend,
  not by the browser: an extension grant on `/token`
  (`grant_type=urn:memebattle:oauth:grant-type:guest`) available to a
  confidential client with `guest_login_allowed`. It creates the account and
  returns the token triple; no CAS session, no UI. Tokens carry `amr: ["anon"]`
  / `account_type: "guest"`.
- Upgrade: the application redirects the guest to `/authorize` with
  `id_token_hint`, a fresh guest ID token (the confidential client refreshes
  before building the link; an expired hint is refused, the hint opens a
  session and is therefore a bearer credential in a URL). CAS opens an
  _upgrade_ session for that guest and continues to create-account; the passkey
  registered there attaches to the same account, `sub` unchanged, app data
  survives (fixes the legacy behavior where the temporary identity was lost).
  A guest that signs in to an existing account instead stays a guest; its data
  is lost, by design.
- The upgrade is a privilege change and is guarded like one. The threat is
  session fixation: an attacker opens an upgrade session for a guest, hands the
  upgrade link to a victim, the victim registers a passkey, and the attacker's
  session now names a full account. Therefore:
  - An upgrade session is restricted, and the backend enforces it, not the UI:
    it can only run the account-registration ceremony for its own `sub` and
    continue `/authorize`. No passkey addition or listing, no email changes.
  - Finishing that ceremony is one transaction with the account row locked:
    store the passkey, `type = full`, delete every other session of the
    account, revoke every grant of the account (and with it every refresh
    token), drop the account's other pending ceremonies, and rotate the current
    session into a full one. Only the browser that completed the ceremony holds
    a live session; `/authorize` then issues a code and the application
    receives fresh tokens. Nothing legitimate is lost: a guest lives in one
    browser by construction. A second browser racing the same upgrade fails on
    the lock (`type` is already `full`, its session is gone).
  - Access tokens already issued stay valid until `exp` (≈10 min) and still
    carry `account_type: "guest"`; resource servers keep trusting the claim.
    An accepted window, not extra work.
  - Accepted loss: a leaked hint lets a stranger upgrade and take over the
    guest, and the owner loses that guest's data. Guest data is cheap.
- GC of inactive guests is deferred; every first visit in a new browser mints a
  guest, so it will be needed before the base grows. The guest grant is
  rate-limited per client meanwhile.

**SSO**

- CAS is an OIDC provider with a minimal profile (see below). Apps are ordinary
  OIDC clients using standard libraries; no custom SDK like the legacy
  `cas-services`.
- Access tokens are JWTs (RFC 9068, ES256), not opaque tokens with introspection:
  resource servers verify locally against JWKS, CAS is not on the request path
  of the applications. Revocation is short access TTL plus refresh rotation.
  Introspection can be added later if agents need instant revocation; the
  reverse migration would touch every resource server.
- `aud` is a resource identifier configured per client (`ligretto` for both
  ligretto backends), not the `client_id`.
- Clients are the only application entity: `clients` with `first_party`,
  `guest_login_allowed`, kind public/confidential, redirect URIs. There is no
  "app" grouping and no user-belongs-to-client; the account ↔ client relation is
  a grant, created when the account authorizes the client. Ligretto is one
  confidential client: its backend exchanges the code for the browser and mints
  guests; the browser only starts `/authorize`.
- Consent is skipped for first-party clients; the consent screen for other
  clients arrives with agent delegation.
- Refresh tokens are not bound to the CAS cookie session: signing out of CAS
  does not sign the user out of ligretto on their phone.
- Refresh tokens are opaque, stored as a hash under a `grants` row (account ×
  client, scopes, `revoked_at`). Rotation inserts the successor and marks the
  presented token used; used rows stay until the absolute expiry so a replayed
  token is recognised, which revokes the whole grant. That is the only
  revocation state: `revoked_at` on the grant, no separate list. Access tokens
  are never revoked, they expire. Expired rows go with the scheduled cleanup
  (ADR 0002), never on the request path.

**External providers**

- Telegram is an OIDC provider (`oauth.telegram.org`, code + PKCE, ID token only,
  no userinfo, no refresh); the client is a bot registered with BotFather. Its
  `telegram:bot_access` scope lets our bot message the user afterwards, which
  makes a linked Telegram one of the approval channels for agents (a
  CIBA-like flow).
  GitHub is plain OAuth 2 and fits the same provider trait. See the External
  providers milestone.
- One external identity belongs to exactly one account; there is no account
  merging.

**Scope cuts**

- No migration of legacy users (the old base is nearly empty). Clean start.
- Frontend: new `apps/cas-frontend`; replaces `apps/auth-front` when the ligretto
  integration lands, after which auth-front and `packages/cas-services` are
  removed.
- Admin panel (users, clients, delegations): later milestone, not in the first
  versions.

**Process**

- Tickets: GitHub Issues in MemeBattle/monorepo, label `cas`, human-readable
  milestones. Issues are in English, terse.
- CI already covers cas (`.github/workflows/cas-pr.yml`).

## Milestones

Done:

- **Foundation** ([milestone 16](https://github.com/MemeBattle/monorepo/milestone/16)):
  Postgres (docker-compose, pool, migrations), config from env, unified error
  model.
- **Passkey auth** ([milestone 17](https://github.com/MemeBattle/monorepo/milestone/17)):
  registration + login ceremonies backed by DB, cookie sessions, multiple
  passkeys per account, passkey management, account email, new frontend
  (sign-in, create account, dashboard), e2e on a virtual authenticator.

Next, in order:

- **SSO for applications** ([milestone 18](https://github.com/MemeBattle/monorepo/milestone/18)):
  OIDC endpoints, clients registry, guest grant + guest→full upgrade, a
  reference-client integration test, OpenAPI, the integration guide. No
  production, no ligretto changes.
- **Production:** deploy CAS + cas-frontend, domain and stable `rp_id`, secrets,
  the periodic cleanup of expired ceremonies and sessions (ADR 0002, 0004),
  monitoring. Tickets cut when SSO nears completion.
- **Ligretto on CAS:** ligretto-frontend on an OIDC client (redirect to
  `/authorize`, code handed to core-backend), core-backend as the confidential
  client (code exchange, refresh, guest grant, display-name snapshot for other
  players), gameplay-backend verifying JWTs via JWKS on the socket handshake,
  one-shot cutover, removal of `auth-front`, `cas-services`, `init-partner`.
- **External providers** ([milestone 19](https://github.com/MemeBattle/monorepo/milestone/19)):
  external identities + provider abstraction, Telegram sign-in and linking,
  Telegram bot infrastructure, GitHub, mock provider for dev/e2e.
- **Profile & files:** user profile, avatars, S3 storage abstraction with
  filesystem backend for dev.
- **Email:** verification + magic-link recovery.
- **Agent delegation:** agent identities, scoped/expiring/revocable delegation
  grants, consent screen, approval through a linked channel (Telegram first),
  audit UI, token exchange
  (RFC 8693), dynamic client registration (RFC 7591) for MCP-style clients.
- **Admin panel:** users, OIDC clients, delegations, audit.

## OIDC profile (what "minimal" means)

Implemented in the SSO milestone:

- Authorization Code flow with PKCE (S256) for all clients
- `GET /.well-known/openid-configuration`, `GET /jwks.json`
- `GET /authorize` (with `id_token_hint` for the guest upgrade), `POST /token`,
  `GET /userinfo`, `GET /end_session`
- Refresh tokens with rotation and reuse detection
- Guest extension grant for confidential clients
- Statically registered clients (DB, managed by hand until the admin panel)

Deliberately postponed or excluded:

- Implicit & hybrid flows, Resource Owner Password grant — never
- Consent screen — agent delegation (first-party clients skip it)
- Dynamic Client Registration, token exchange — agent delegation
- Client credentials grant — when a service-to-service need appears
- Token introspection — only if agents need instant revocation
- JWE tokens, JAR, PAR, ACR/AMR beyond guest claims — not planned
- Logout specs beyond RP-initiated logout — not planned

## Tickets

Foundation: config [#660](https://github.com/MemeBattle/monorepo/issues/660) →
Postgres [#661](https://github.com/MemeBattle/monorepo/issues/661) →
migrations [#662](https://github.com/MemeBattle/monorepo/issues/662);
error model [#663](https://github.com/MemeBattle/monorepo/issues/663) in parallel.

Passkey auth: accounts [#664](https://github.com/MemeBattle/monorepo/issues/664) →
registration [#665](https://github.com/MemeBattle/monorepo/issues/665) →
login [#666](https://github.com/MemeBattle/monorepo/issues/666) →
sessions [#667](https://github.com/MemeBattle/monorepo/issues/667) →
passkey management [#668](https://github.com/MemeBattle/monorepo/issues/668).
Frontend: scaffold [#669](https://github.com/MemeBattle/monorepo/issues/669) →
sign-in [#670](https://github.com/MemeBattle/monorepo/issues/670) →
dashboard [#671](https://github.com/MemeBattle/monorepo/issues/671).

SSO for applications: clients [#740](https://github.com/MemeBattle/monorepo/issues/740)
and keys + discovery [#741](https://github.com/MemeBattle/monorepo/issues/741) →
authorize [#742](https://github.com/MemeBattle/monorepo/issues/742) →
token [#743](https://github.com/MemeBattle/monorepo/issues/743) →
refresh rotation [#744](https://github.com/MemeBattle/monorepo/issues/744),
userinfo + logout [#745](https://github.com/MemeBattle/monorepo/issues/745),
guest grant [#746](https://github.com/MemeBattle/monorepo/issues/746) →
guest upgrade [#747](https://github.com/MemeBattle/monorepo/issues/747).
Frontend: authorize continuation [#748](https://github.com/MemeBattle/monorepo/issues/748) →
guest screens [#749](https://github.com/MemeBattle/monorepo/issues/749).
Proof and docs: reference client test [#750](https://github.com/MemeBattle/monorepo/issues/750),
integration guide [#751](https://github.com/MemeBattle/monorepo/issues/751),
OpenAPI [#752](https://github.com/MemeBattle/monorepo/issues/752).

External providers: abstraction [#753](https://github.com/MemeBattle/monorepo/issues/753) →
Telegram sign-in [#754](https://github.com/MemeBattle/monorepo/issues/754),
link/unlink [#755](https://github.com/MemeBattle/monorepo/issues/755) →
bot infrastructure [#756](https://github.com/MemeBattle/monorepo/issues/756);
frontend sign-in [#757](https://github.com/MemeBattle/monorepo/issues/757),
connected accounts [#758](https://github.com/MemeBattle/monorepo/issues/758);
GitHub [#759](https://github.com/MemeBattle/monorepo/issues/759),
mock provider [#760](https://github.com/MemeBattle/monorepo/issues/760).

## Open questions

- [ ] Token lifetimes: access (≈10 min), refresh absolute (≈30 days), guest
      grant lifetime — confirm the numbers in #743/#744/#746.
- [ ] Guest GC policy (deferred): inactivity threshold, whether a guest with a
      live refresh token is ever collected.
- [ ] When to request `telegram:bot_access`: on every Telegram sign-in, or as a
      separate "enable notifications" step. Leaning to always.
- [ ] Agent delegation details: agent as OAuth client, scopes model per
      service, which approvals may be a Telegram button and which must go
      through a passkey-backed page.
- [ ] Deployment/infra (Production milestone): where it runs, TLS/domain
      (WebAuthn requires a stable rp_id), secrets, signing-key rotation
      procedure.
- [ ] Local development against real Telegram/GitHub: tunnel + registered
      redirect URL, or the mock provider only (#760).

## Working agreements (lit factory)

- Small PRs, one understandable change each.
- Significant decisions get a short ADR in `docs/adr/`.
- Tickets are cut per-milestone from this plan after discussion.
