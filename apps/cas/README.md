# CAS

CAS (Central Authentication Service) is a centralized authentication and user management service for an ecosystem of applications. It serves as a single Identity Provider (IdP) that allows multiple applications to delegate user authentication and identity management, eliminating the need for each application to implement its own authentication system.

## Configuration

Configuration is read from environment variables at startup. Every variable has a dev-friendly default, so `bacon run` works with no environment set. An invalid value fails startup with an error.

| Variable           | Default                                                                | Description                                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CAS_PORT`         | `3000`                                                                 | TCP port the server listens on.                                                                                                                                                                                                                            |
| `CAS_RP_ID`        | `localhost`                                                            | WebAuthn relying party ID.                                                                                                                                                                                                                                 |
| `CAS_ORIGIN`       | `http://localhost:5173`                                                | WebAuthn relying party origin URL. An `https` origin also marks the session cookie `Secure`.                                                                                                                                                               |
| `CAS_CORS_ORIGINS` | `http://localhost:5173`                                                | Comma-separated list of allowed CORS origins.                                                                                                                                                                                                              |
| `DATABASE_URL`     | `postgres://cas:cas@localhost:5434/cas`                                | Postgres connection URL. The default matches `docker-compose.yml`.                                                                                                                                                                                         |
| `CAS_ISSUER`       | `http://localhost:3000`                                                | The public base URL of CAS, published verbatim as the discovery document's `issuer` and used as the base of every advertised endpoint. `http`/`https`, no query, no fragment, no trailing slash — a value that needs repair is rejected, never normalised. |
| `CAS_SIGNING_KEY`  | the checked-in development key in debug builds, none in release builds | One or more PEM-encoded P-256 private keys, PKCS#8 or SEC1, concatenated; the first signs, all are published in `/jwks.json`. A release server refuses to start without it.                                                                                |

At startup the service also loads the monorepo root `.env` files. `APP_ENV` selects the environment and defaults to `development`; missing files are skipped. Priority, highest first:

1. the real process environment
2. `.env.{APP_ENV}.local`
3. `.env.{APP_ENV}`
4. `.env.local`
5. `.env`

## Signing key and rotation

Tokens are signed with ES256. A key is generated with:

```
openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt
```

`apps/cas/dev/signing-key.pem` is the development default. It is public because it is in git, and it is compiled only into debug builds: never set it in production. In a `.env` file a multi-line PEM is written as one double-quoted value with `\n` escapes.

Rotation, one deploy per step:

1. Append the new key after the current one: it is published, not yet signing.
2. Wait for caches — the discovery document and the JWKS are cached for an hour, and resource servers keep their own JWKS cache.
3. Move the new key first: it signs from now on, the old one stays published.
4. Once every token the old key signed has expired **and 30 days have passed since it stopped signing**, drop the old key. An ID token stays a valid logout hint for as long as the session it names can live, so CAS keeps verifying it with the old key until then (see [docs/adr/0013-userinfo-and-rp-initiated-logout.md](./docs/adr/0013-userinfo-and-rp-initiated-logout.md)).

The active `kid` and the number of published keys are logged at startup.

## OIDC discovery

`GET /.well-known/openid-configuration` and `GET /jwks.json` are served at the root, outside `/api`. The discovery document lists the grant types `/token` serves, the guest grant among them. See [docs/adr/0009-signing-key-and-discovery.md](./docs/adr/0009-signing-key-and-discovery.md).

## Authorization endpoint

`GET /authorize` (at the root, e.g. `http://localhost:3000/authorize`) starts the authorization code flow. A client sends `client_id`, a registered `redirect_uri` (exact match), `response_type=code`, a `scope` that includes `openid`, `state`, and a PKCE `code_challenge` with `code_challenge_method=S256`; `nonce` is optional. An unknown client or an unregistered redirect URI gets an HTML error page from CAS; every other error is redirected back to the client with `error`, `error_description` and `state`. Without a session the browser is sent to `{CAS_ORIGIN}/sign-in?return_to=<the /authorize path and query>`, a relative path the frontend navigates back to after sign-in (the frontend half is #748; in development the Vite server does not proxy `/authorize` yet). With a session, a first-party client gets a one-time code valid for 60 seconds; other clients are refused with `unauthorized_client` until consent exists. See [docs/adr/0010-authorization-endpoint.md](./docs/adr/0010-authorization-endpoint.md).

## Token endpoint

`POST /token` (at the root, e.g. `http://localhost:3000/token`) exchanges a code for tokens. The body is `application/x-www-form-urlencoded` with `grant_type=authorization_code`, the `code`, the same `redirect_uri` as the authorization request and the PKCE `code_verifier`. A confidential client authenticates with `Authorization: Basic` (`client_secret_basic`) or with `client_id` and `client_secret` in the body (`client_secret_post`), never both; a public client sends `client_id` alone. The answer is `access_token`, `token_type: Bearer`, `expires_in: 600`, `refresh_token`, `id_token` and `scope`, with `Cache-Control: no-store`.

- The access token is an ES256 JWT (RFC 9068, `typ: at+jwt`) that resource servers verify against `/jwks.json`. Its `aud` is the client's configured audience (`--audience`, see below), and it carries `sub` (the account id), `client_id`, `scope`, `jti`, `amr` (`["webauthn"]`, or `["anon"]` for a guest) and `account_type` (`full` or `guest`). It lives 10 minutes and cannot be revoked.
- The ID token is for the client (`aud` = `client_id`), with the `nonce` of the authorization request, the display name as `name` with the `profile` scope (a full account's only: a guest has none), and `email` (always `email_verified: false`) with the `email` scope. It lives 10 minutes too.
- The refresh token is opaque and stored only as its SHA-256, under a grant that expires 30 days after the exchange, whatever happens.

A refresh is `grant_type=refresh_token` with the `refresh_token` and an optional `scope`, with the same client authentication. The answer is the same set — a new access token, a new ID token (without `nonce`) and a **new** refresh token — for the grant's full scopes: a `scope` may repeat or narrow the grant's (it is then ignored) but not widen it. Every refresh retires the token it presents; presenting a retired token again is treated as theft and revokes the grant, so the token the rotation issued stops working too and the user signs in again. A client must therefore never refresh the same token twice concurrently. Signing out of CAS does not end a grant, and no refresh moves its 30-day cap. See [docs/adr/0012-refresh-token-rotation.md](./docs/adr/0012-refresh-token-rotation.md).

A guest account is minted with `grant_type=urn:memebattle:oauth:grant-type:guest` and an optional `scope`, from the application's backend, without any UI. Only a confidential client registered with `--guest-login-allowed` may use it, with the same client authentication; any other client gets `unauthorized_client`. Each request creates a new account of type `guest` — no credentials, no email, no CAS session, and a generated display name of its own (`Guest <n>`, from a database sequence) that is never released to the client — and answers the usual set for it: the tokens carry `amr: ["anon"]` and `account_type: "guest"`, and never a `name`. `scope` defaults to `openid` alone; otherwise it must include `openid` and stay within the client's scopes. The guest's grant is like any other: it refreshes the same way and ends 30 days after the guest was minted, so a guest identity lasts that long unless the player creates an account. A client may mint at most `--guest-grants-per-minute` guests (default 60) in any minute; past that the answer is `429 rate_limit_exceeded` with `Retry-After: 60`. See [docs/adr/0014-guest-accounts-and-the-guest-grant.md](./docs/adr/0014-guest-accounts-and-the-guest-grant.md).

Errors are RFC 6749 JSON, `{"error": "...", "error_description": "..."}`: `invalid_client` (401) for a client that fails to authenticate, `invalid_grant` for a code that is unknown, expired, already used, voided by signing out of CAS before it was redeemed, issued to another client or redirect URI, or presented with the wrong verifier — the first presentation that gets past client authentication spends the code, and presenting it again revokes the grant it produced, even after the account has signed out — and for a refresh token that is unknown, expired, revoked, already used or issued to another client, `invalid_scope` for a refresh that asks for more than its grant or a guest scope outside the rules above, `unauthorized_client` for a client that may not use the guest grant, `rate_limit_exceeded` (429) past a client's guest limit, and `invalid_request` or `unsupported_grant_type` for a malformed request. See [docs/adr/0011-token-endpoint-and-access-tokens.md](./docs/adr/0011-token-endpoint-and-access-tokens.md).

## Userinfo endpoint

`GET` or `POST /userinfo` (at the root, e.g. `http://localhost:3000/userinfo`) answers the claims of the account an access token was issued for, as they are now: `sub` and `account_type` always, `name` with the `profile` scope (a guest's answer has none), and `email` with `email_verified: false` with the `email` scope when the account has an address. The token goes in an `Authorization: Bearer <access token>` header, never in the query or the body. Any unexpired access token CAS issued with the `openid` scope is accepted, whatever its `aud`; a revoked grant's token still reads userinfo until it expires. Errors follow RFC 6750: no Bearer header is `401` with a bare `WWW-Authenticate: Bearer`, a malformed header `400 invalid_request`, an invalid or expired token `401 invalid_token`, a token without `openid` `403 insufficient_scope`, each with the code in the challenge and in a JSON body. Answers are `Cache-Control: no-store`. `/userinfo` is the one route open to any origin through CORS (no credentials, the `Authorization` header allowed), so a browser application can call it with a token it holds; `/token` stays backend-to-backend. See [docs/adr/0013-userinfo-and-rp-initiated-logout.md](./docs/adr/0013-userinfo-and-rp-initiated-logout.md).

## End session (RP-initiated logout)

`GET /end_session` (or `POST` with an `application/x-www-form-urlencoded` body) signs the browser out of CAS and sends it back to the application. Parameters:

- `id_token_hint` — **required**: an ID token CAS issued to the client, expired or not.
- `client_id` — optional; if sent, it must be the hint's `aud`.
- `post_logout_redirect_uri` — optional; must be one the client registered (`cas-client register --post-logout-redirect-uri`), exact match. Without it the browser goes to the CAS frontend's root.
- `state` — optional; appended to `post_logout_redirect_uri`.

A request that fails any check — missing or invalid hint, mismatched `client_id`, unknown client, unregistered `post_logout_redirect_uri`, a repeated parameter — gets an HTML error page from CAS, never a redirect, and ends nothing. A valid request ends the CAS session the cookie names only if it belongs to the hint's account; a session of another account is left alone, and the browser is redirected either way. The response clears the cookie and sends `Clear-Site-Data: "cache", "storage"` when a session was ended. Grants and refresh tokens are untouched: the application drops its own tokens. The session cookie is `SameSite=Lax`, so an application on another site must use `GET` (a top-level navigation): a cross-site form `POST` reaches CAS without the cookie and ends nothing. See [docs/adr/0013-userinfo-and-rp-initiated-logout.md](./docs/adr/0013-userinfo-and-rp-initiated-logout.md).

## Database (local dev)

Postgres runs in Docker; `docker-compose.yml` in this directory provides it with dev-only credentials (user/password/db `cas`) on host port `5434`:

```
docker compose -f apps/cas/docker-compose.yml up -d
```

The connection pool is lazy: the server starts even when the DB is down. `GET /health` runs `SELECT 1` and returns `200` when the DB answers, `503` otherwise.

## Migrations

Migrations are applied by the `cas-migrate` binary:

```
cargo run -p cas --bin cas-migrate
```

The workflow (creating migrations, immutability, expand/contract, CI ordering check) is described in [docs/MIGRATIONS.md](./docs/MIGRATIONS.md).

## OIDC clients

The applications allowed to start an authorization flow live in the `clients` table. The registry is managed by hand until the admin panel exists, and never by a migration — a migration runs everywhere, so a dev client with a known secret would reach production. Rows are written by the `cas-client` binary, which reads `DATABASE_URL` exactly like the app:

```
cargo run -p cas --bin cas-client -- register \
  --id <client_id> --name <name> --kind <public|confidential> \
  --redirect-uri <uri> [--redirect-uri <uri>]... \
  [--post-logout-redirect-uri <uri>]... \
  [--first-party] \
  [--guest-login-allowed [--guest-grants-per-minute <n>]] \
  [--scope <scope>]... [--audience <resource>]
```

| Flag                         | Meaning                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `--id`                       | The OIDC `client_id`: a slug of `[a-z0-9._-]`, at most 64 characters.                |
| `--name`                     | What a consent screen shows for the client.                                          |
| `--kind`                     | `confidential` (a server that authenticates with a secret) or `public` (PKCE alone). |
| `--redirect-uri`             | Repeatable, at least one. Absolute `http`/`https`, no fragment.                      |
| `--post-logout-redirect-uri` | Repeatable. Where RP-initiated logout may return the browser.                        |
| `--first-party`              | The client skips the consent screen.                                                 |
| `--guest-login-allowed`      | The client may mint guest accounts through the guest grant.                          |
| `--guest-grants-per-minute`  | With `--guest-login-allowed`: how many guests it may mint per minute. Default 60.    |
| `--scope`                    | Repeatable allow-list of what the client may request. Defaults to `openid`.          |
| `--audience`                 | The `aud` of its access tokens, naming the resource server. Defaults to the id.      |

A redirect URI is matched by exact string comparison, so it must be registered exactly as the client will send it: `https://app.example` and `https://app.example/` are two different registrations.

Give a client `--guest-login-allowed` only once every serving instance runs a release with the guest grant: an older instance that refreshes a guest's tokens would release its generated `Guest <n>` display name as its `name`.

A confidential client's secret is generated by CAS and printed once, on stdout; the table stores only its SHA-256, so it cannot be shown again. A mistake is fixed by registering another id — there is no update, delete or rotate until the admin panel.

The development database gets a `ligretto` client from:

```
apps/cas/scripts/seed-dev.sh
```

Its redirect URIs are placeholders until ligretto is wired to CAS. A second run fails with "already exists", which is the signal that the client is already there. See [docs/adr/0008-oidc-clients-registry.md](./docs/adr/0008-oidc-clients-registry.md).

## Prepare bacon (used for dev server reload)

```
cargo install --locked bacon
```

```
bacon run
```
