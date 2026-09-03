# CAS v2 — Plan

Umbrella issue: [MemeBattle/monorepo#548](https://github.com/MemeBattle/monorepo/issues/548).
This is the living planning doc; decisions land here first, tickets are cut from it.

## Vision

CAS is the single Identity Provider for the MemeBattle ecosystem, replacing the
legacy [my-cas](https://github.com/MemeBattle/my-cas) (Node.js, MongoDB, Redis,
email/password + VK login, 7-service architecture).

- **Passwordless.** No password system at all; passkeys (WebAuthn) are the primary
  authentication method. OAuth login via external providers (Google, Telegram, ...)
  comes in a later version.
- **Agent-friendly.** A user signs in with a passkey and can delegate scoped,
  revocable, auditable access to an agent that has its own identity.
- **Stack:** Rust (axum), PostgreSQL, S3 for files (filesystem backend in dev).
- **Process: "lit factory"** — the agent writes the code, the human understands
  every change. Small, reviewable increments.

## Key decisions

**Authentication & UX**

- Registration and authentication remain separate WebAuthn ceremonies on the
  backend, but the frontend has a single entry screen: conditional-mediation login
  via discoverable credentials (no identifier asked) plus an explicit
  "create account" path.
- Registration asks only for a display name.

**Identity**

- Account id is a uuid (OIDC `sub`). Display name is non-unique; no unique
  username in v1 (an optional "claim your handle" feature may come later if a
  product need appears).
- Email is optional and stored unverified in v1: it is the future recovery anchor.
  The dashboard nudges the user to add it. Verification flow arrives with M4.

**Recovery**

- No recovery mechanism in v1. We rely on synced passkeys and nudge the user to
  add a second passkey. Magic-link recovery ships together with email
  verification (M4). No recovery codes.

**Guest (temporary) users**

- Preserved from the legacy CAS (ligretto depends on them) and stored in the DB:
  a guest is a normal account row (`type = guest`, same uuid `sub`) with no
  credentials. One code path for guests and full accounts (sessions, refresh
  rotation, `/me`, userinfo); GC is a cron delete of inactive guests.
- Clients request guest login with `acr_values=guest` on `/authorize`; CAS creates
  the account + session and redirects back without UI. Tokens carry
  `amr: ["anon"]` / `account_type: "guest"`.
- Upgrade: a guest with an active session registers a passkey → the same account
  becomes full, `sub` unchanged, app data survives (fixes the legacy behavior
  where the temporary identity was lost).

**SSO**

- CAS is an OIDC provider with a minimal profile (see below). Apps are ordinary
  OIDC clients using standard libraries; no custom SDK like the legacy
  `cas-services`.

**Scope cuts**

- No migration of legacy users (the old base is nearly empty). Clean start.
- Frontend: new `apps/cas-frontend`; replaces `apps/auth-front` when SSO
  integration lands (M2), after which auth-front is removed.
- Admin panel (users, clients, delegations): later milestone, not in the first
  versions.

**Process**

- Tickets: GitHub Issues in MemeBattle/monorepo, label `cas`, human-readable
  milestones. Issues are in English, terse.
- CI already covers cas (`.github/workflows/cas-pr.yml`).

## Milestones

- **M0 — Foundation:** Postgres (docker-compose, pool, migrations), config from
  env, unified error model.
- **M1 — Passkey auth:** registration + login ceremonies backed by DB, cookie
  sessions, multiple passkeys per account, passkey management, new frontend
  (sign-in, create account, dashboard).
- **M2 — SSO for applications:** OIDC endpoints, clients registry, consent
  screen, guest login + guest→full upgrade, guest GC, integrate ligretto
  end-to-end, replace `auth-front` + `cas-services`.
- **M3 — Profile & files:** user profile, avatars, S3 storage abstraction with
  filesystem backend for dev.
- **M4 — OAuth providers & email:** Google, Telegram, ... as additional login
  methods with account linking; email verification + magic-link recovery.
- **M5 — Agent delegation:** agent identities, scoped/expiring/revocable
  delegation grants, consent + audit UI, token exchange (RFC 8693), dynamic
  client registration (RFC 7591) for MCP-style clients.
- **M6 — Admin panel:** users, OIDC clients, delegations, audit.

## OIDC profile (what "minimal" means)

Implemented in M2:

- Authorization Code flow with PKCE (S256) for all clients
- `GET /.well-known/openid-configuration`, `GET /jwks.json`
- `GET /authorize`, `POST /token`, `GET /userinfo`
- Refresh tokens with rotation
- Statically registered clients (DB, managed by hand until the admin panel)

Deliberately postponed or excluded:

- Implicit & hybrid flows, Resource Owner Password grant — never
- Dynamic Client Registration, token exchange — M5 (agents need them)
- Client credentials grant — when a service-to-service need appears
- JWE tokens, JAR, PAR, ACR/AMR beyond `acr_values=guest` — not planned
- Logout specs — start with simple RP-initiated logout redirect

## Tickets

Milestones on GitHub: [CAS: Foundation](https://github.com/MemeBattle/monorepo/milestone/16),
[CAS: Passkey auth](https://github.com/MemeBattle/monorepo/milestone/17).

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

## Open questions

- [ ] Session/token model details: access-token format for APIs (JWT vs opaque +
      introspection) — decide in M2.
- [ ] Guest details for M2 tickets: GC policy, per-client "guest login allowed"
      flag, guest session/refresh lifetime.
- [ ] Agent delegation details (M5): agent as OAuth client, scopes model per
      service.
- [ ] Deployment/infra: where it runs, TLS/domain (WebAuthn requires a stable
      rp_id), secrets.
- [ ] WebAuthn ceremony state is in-memory (`src/ceremony.rs`), so a ceremony
      must finish on the instance that started it: the deployment runs a single
      replica until the state moves to a shared store.
- [ ] Registration requests `residentKey: discouraged` (see
      `docs/adr/0001-passkey-persistence.md`), so a hardware security key may
      not be discoverable and cannot serve usernameless login. Decide with
      #666/#670 what the sign-in screen falls back to.

## Working agreements (lit factory)

- Small PRs, one understandable change each.
- Significant decisions get a short ADR in `docs/adr/`.
- Tickets are cut per-milestone from this plan after discussion.
