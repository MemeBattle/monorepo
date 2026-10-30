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
- **Stack:** Rust (axum) on Cloudflare Workers (`wasm32-unknown-unknown`,
  workers-rs), PostgreSQL on Neon behind Hyperdrive; natively (dev, tests) the
  same code on tokio with a pool. Object storage for files is still to be
  chosen (filesystem backend in dev).
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
  not by the browser: an extension grant on `/oidc/token`
  (`grant_type=urn:memebattle:oauth:grant-type:guest`) available to a
  confidential client with `guest_login_allowed`. It creates the account and
  returns the token triple; no CAS session, no UI. Tokens carry `amr: ["anon"]`
  / `account_type: "guest"`.
- Upgrade: the application redirects the guest to `/oidc/authorize` with
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
    it can only run the account-registration ceremony for its own `sub`,
    continue `/oidc/authorize` and read `GET /api/me` (ADR 0018). No passkey
    addition or listing, no email changes.
  - Finishing that ceremony is one transaction with the account row locked:
    store the passkey, `type = full`, delete every other session of the
    account, revoke every grant of the account (and with it every refresh
    token), drop the account's other pending ceremonies, and rotate the current
    session into a full one. Only the browser that completed the ceremony holds
    a live session; `/oidc/authorize` then issues a code and the application
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
  rate-limited per client meanwhile (ADR 0014 (e)).

**SSO**

- CAS is an OIDC provider with a minimal profile (see below). Apps are ordinary
  OIDC clients; an application outside the monorepo uses a standard OIDC
  library and the integration guide (`docs/INTEGRATION.md`). The monorepo's
  own applications share `packages/ligretto-auth`: a server-only package with
  the client generated from the OpenAPI description, access-token
  verification, the confidential client and the HTTP handlers. It is a thin
  layer over the standard flows, not a protocol of its own like the removed
  legacy `cas-services`.
- Access tokens are JWTs (RFC 9068, ES256), not opaque tokens with introspection:
  resource servers verify locally against JWKS, CAS is not on the request path
  of the applications. Revocation is short access TTL plus refresh rotation.
  Introspection can be added later if agents need instant revocation; the
  reverse migration would touch every resource server. See ADR 0011.
- `aud` is a resource identifier configured per client (`ligretto` for both
  ligretto backends), not the `client_id`: `clients.audience`, ADR 0011.
- Clients are the only application entity: `clients` with `first_party`,
  `guest_login_allowed`, kind public/confidential, redirect URIs. There is no
  "app" grouping and no user-belongs-to-client; the account ↔ client relation is
  a grant, created when the account authorizes the client. Ligretto is one
  confidential client: its backend exchanges the code for the browser and mints
  guests; the browser only starts `/oidc/authorize`.
- Consent is skipped for first-party clients; the consent screen for other
  clients arrives with agent delegation.
- Refresh tokens are not bound to the CAS cookie session: signing out of CAS
  does not sign the user out of ligretto on their phone.
- Refresh tokens are opaque, stored as a hash under a `grants` row (account ×
  client, scopes, `revoked_at`). Rotation inserts the successor and marks the
  presented token used; used rows stay until the absolute expiry so a replayed
  token is recognised, which revokes the whole grant (ADR 0012). That is the only
  revocation state: `revoked_at` on the grant, no separate list. Access tokens
  are never revoked, they expire. Expired rows go with the scheduled cleanup
  (ADR 0002), never on the request path. A grant is created per code
  exchange, so each device has its own; a replayed code revokes the grant it
  produced (ADR 0011).

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

**Runtime and deployment**

- CAS is stateless by construction (ADR 0002: any replica serves any request,
  nothing is kept in memory). That is what made Cloudflare Workers possible
  without touching the ceremonies or the schema.
- One Worker on `cas.mems.fun`: the Rust entrypoint (ADR 0022) on CAS's own
  paths, the cas-frontend SPA as the Worker's static assets on every other
  path. One origin, so `rp_id`, issuer and CORS are all `cas.mems.fun`.
- The database is one `PgConnection` per request from the Hyperdrive binding,
  closed when the request ends (ADR 0021, 0022); the services see a `Db`
  handle and do not know which runtime they are on. Hyperdrive's query cache
  is disabled; the origin is the Neon project `cas` over its direct endpoint,
  Hyperdrive does the pooling.
- No OpenSSL anywhere: ES256 on `p256` (ADR 0019), webauthn-rs 0.6 through a
  MemeBattle fork (ADR 0020), sqlx through a MemeBattle fork plus the vendored
  `sqlx-cloudflare-hd` (`vendor/`). `cargo sqlx prepare` runs on the host
  target only; the Worker builds offline against `.sqlx`.
- Migrations never run through the Worker: `cas-migrate` over a direct
  connection, in the release job before the upload.
- Releases are continuous: every push to `master` touching CAS or its frontend
  runs `.github/workflows/cas-deploy.yml`, approved through the
  `CAS-production` environment. The signing key is a Worker secret, not part
  of the release; the rotation procedure is in `README.md`.
- Clients are registered by hand with `cas-client` against the origin
  (ADR 0008); a chosen secret exists in development builds alone (ADR 0023).

**Scope cuts**

- No migration of legacy users (the old base is nearly empty). Clean start.
- Frontend: new `apps/cas-frontend`; it replaced `apps/auth-front`, which was
  removed with `packages/cas-services` once ligretto moved onto the new flow.
- Admin panel (users, clients, delegations): later milestone, not in the first
  versions.

**Process**

- Tickets: GitHub Issues in MemeBattle/monorepo, label `cas`, human-readable
  milestones. Issues are in English, terse.
- CI: `cas-pr.yml` and `cas-frontend-pr.yml` on pull requests, `cas-deploy.yml`
  releases from `master`.

## Milestones

Done:

- **Foundation** ([milestone 16](https://github.com/MemeBattle/monorepo/milestone/16)):
  Postgres (docker-compose, pool, migrations), config from env, unified error
  model.
- **Passkey auth** ([milestone 17](https://github.com/MemeBattle/monorepo/milestone/17)):
  registration + login ceremonies backed by DB, cookie sessions, multiple
  passkeys per account, passkey management, account email, new frontend
  (sign-in, create account, dashboard), e2e on a virtual authenticator.

- **SSO for applications** ([milestone 18](https://github.com/MemeBattle/monorepo/milestone/18)):
  OIDC endpoints under `/oidc`, clients registry, guest grant + guest→full
  upgrade, a reference-client integration test, OpenAPI (utoipa) with the
  frontend client generated from it, the integration guide.
- **Production** (no milestone; #794–#806): CAS and cas-frontend as one
  Cloudflare Worker on `cas.mems.fun`, Neon behind Hyperdrive, the crypto and
  driver forks that made the wasm32 target buildable, continuous release from
  `master`. See "Runtime and deployment" above. Left open from this milestone,
  tracked under "Operations" below: the scheduled cleanup, monitoring, a
  rehearsed key rotation.

In progress:

- **Ligretto on CAS** ([milestone 20](https://github.com/MemeBattle/monorepo/milestone/20)):
  done — `packages/ligretto-auth` (token verification, the confidential
  client and sessions, the HTTP handlers and the session transport, the
  reference run against a real CAS in CI), the dev seed with ligretto's real
  callback, gameplay-backend verifying the socket handshake with
  `ligretto-auth`, core-backend's Postgres session store and the mounted auth
  handlers with users served from the profile snapshot, ligretto-frontend on
  the new flow, and the removal of `auth-front`, `cas-services` and the
  `/auth` routes. The production origin layout is decided (#865): one origin,
  `ligretto.app`, for the SPA and the API, with the first-party cookie
  transport. Left — the production client registration (#812).
- **External providers** ([milestone 19](https://github.com/MemeBattle/monorepo/milestone/19)),
  started in parallel: external identities + provider abstraction (in review),
  then Telegram sign-in and linking, Telegram bot infrastructure, GitHub, mock
  provider for dev/e2e.

Next, in order:

- **Profile & files:** user profile, avatars, an object-storage abstraction
  with a filesystem backend for dev (the production store is to be chosen, see
  the open question). Also releases `picture` under the `profile` scope, which
  ligretto-frontend already expects.
- **Email:** verification + magic-link recovery.
- **Agent delegation:** agent identities, scoped/expiring/revocable delegation
  grants, consent screen, approval through a linked channel (Telegram first),
  audit UI, token exchange
  (RFC 8693), dynamic client registration (RFC 7591) for MCP-style clients.
- **Admin panel:** users, OIDC clients (hand-managed until then), delegations,
  audit.

Operations, not a milestone — tickets cut as each becomes pressing:

- The scheduled cleanup of expired ceremonies, sessions, authorization codes,
  grants and refresh tokens (ADR 0002, 0004, 0010, 0011). Promised by the ADRs
  and not yet written: nothing deletes expired rows today. On Workers it is a
  Cron Trigger or a job outside the Worker; never the request path.
- Guest GC, once the cleanup exists and a policy is decided (open question).
- Monitoring and alerting beyond the Worker's observability toggle.
- A rehearsed signing-key rotation against production (procedure in
  `README.md`, ADR 0009).

## OIDC profile (what "minimal" means)

Implemented in the SSO milestone:

- Authorization Code flow with PKCE (S256) for all clients
- `GET /.well-known/openid-configuration`, `GET /oidc/jwks.json`
- `GET /oidc/authorize` (with `id_token_hint` for the guest upgrade),
  `POST /oidc/token`, `GET /oidc/userinfo`, `GET /oidc/end_session` (ADR 0013);
  the protocol endpoints under `/oidc` (ADR 0017)
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

The GitHub milestones hold the tickets and their state; this document does
not repeat them. Milestones with tickets: Foundation (16), Passkey auth (17),
SSO for applications (18), External providers (19), Ligretto on CAS (20).
The Production work ran without a milestone (#794–#806). Profile & files,
Email, Agent delegation and Admin panel have no tickets yet; they are cut
from this plan when their turn comes.

Order inside a milestone, when it matters, is in the tickets' "depends on"
lines, not here.

## Open questions

- [x] Token lifetimes: access and ID token 10 minutes; refresh tokens an
      absolute 30 days from the grant's creation, never extended by rotation.
      Checked against OWASP ASVS 5.0 ch. 10 and RFC 9700 (ADR 0011 (c)).
- [x] Guest grant lifetime: 30 days, absolute, the same as every refresh
      grant; a guest identity is refreshed for at most that long unless it is
      upgraded (ADR 0014 (c)).
- [x] Deployment/infra: Cloudflare Workers with Neon behind Hyperdrive,
      `cas.mems.fun` as the stable `rp_id`, the signing key as a Worker secret,
      release secrets in the `CAS-production` environment, the rotation
      procedure in `README.md` (ADR 0009, 0022). Not yet rehearsed against
      production.
- [ ] The scheduled cleanup: Cron Trigger on the Worker (a request-shaped
      invocation with the same per-request connection) or a job outside it
      (`cas-migrate`-style binary on a schedule). Undecided; it also decides
      where guest GC runs.
- [ ] Guest GC policy (deferred): inactivity threshold, whether a guest with a
      live refresh token is ever collected. Undecided; ADR 0014 (g) lists the
      signals a policy has and what the ticket that writes it must weigh.
- [x] Ligretto's production origin layout: one origin, `ligretto.app`, for the
      SPA and the API, with the first-party cookie transport (#865). The
      production client registration (#812) is still to be run.
- [ ] Object storage for Profile & files: R2 is the obvious choice next to the
      Worker, S3 was the original one; the abstraction hides it either way.
- [ ] When to request `telegram:bot_access`: on every Telegram sign-in, or as a
      separate "enable notifications" step. Leaning to always.
- [ ] Agent delegation details: agent as OAuth client, scopes model per
      service, which approvals may be a Telegram button and which must go
      through a passkey-backed page.
- [ ] Local development against real Telegram/GitHub: tunnel + registered
      redirect URL, or the mock provider only (#760).

## Working agreements (lit factory)

- Small PRs, one understandable change each.
- Significant decisions get a short ADR in `docs/adr/`.
- Tickets are cut per-milestone from this plan after discussion.
