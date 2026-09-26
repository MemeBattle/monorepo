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
4. Once every token the old key signed has expired, drop the old key.

The active `kid` and the number of published keys are logged at startup.

## OIDC discovery

`GET /.well-known/openid-configuration` and `GET /jwks.json` are served at the root, outside `/api`. The discovery document already lists the endpoints later tickets add; until they land, those paths answer 404. See [docs/adr/0009-signing-key-and-discovery.md](./docs/adr/0009-signing-key-and-discovery.md).

## Authorization endpoint

`GET /authorize` (at the root, e.g. `http://localhost:3000/authorize`) starts the authorization code flow. A client sends `client_id`, a registered `redirect_uri` (exact match), `response_type=code`, a `scope` that includes `openid`, `state`, and a PKCE `code_challenge` with `code_challenge_method=S256`; `nonce` is optional. An unknown client or an unregistered redirect URI gets an HTML error page from CAS; every other error is redirected back to the client with `error`, `error_description` and `state`. Without a session the browser is sent to `{CAS_ORIGIN}/sign-in?return_to=<the /authorize path and query>`, a relative path the frontend navigates back to after sign-in (the frontend half is #748; in development the Vite server does not proxy `/authorize` yet). With a session, a first-party client gets a one-time code valid for 60 seconds; other clients are refused with `unauthorized_client` until consent exists. See [docs/adr/0010-authorization-endpoint.md](./docs/adr/0010-authorization-endpoint.md).

## Token endpoint

`POST /token` (at the root, e.g. `http://localhost:3000/token`) exchanges a code for tokens. The body is `application/x-www-form-urlencoded` with `grant_type=authorization_code`, the `code`, the same `redirect_uri` as the authorization request and the PKCE `code_verifier`. A confidential client authenticates with `Authorization: Basic` (`client_secret_basic`) or with `client_id` and `client_secret` in the body (`client_secret_post`), never both; a public client sends `client_id` alone. The answer is `access_token`, `token_type: Bearer`, `expires_in: 600`, `refresh_token`, `id_token` and `scope`, with `Cache-Control: no-store`.

- The access token is an ES256 JWT (RFC 9068, `typ: at+jwt`) that resource servers verify against `/jwks.json`. Its `aud` is the client's configured audience (`--audience`, see below), and it carries `sub` (the account id), `client_id`, `scope`, `jti`, `amr` (`["webauthn"]`, or `["anon"]` for a guest) and `account_type` (`full` or `guest`). It lives 10 minutes and cannot be revoked.
- The ID token is for the client (`aud` = `client_id`), with the `nonce` of the authorization request, `name` with the `profile` scope, and `email` (always `email_verified: false`) with the `email` scope. It lives 10 minutes too.
- The refresh token is opaque and stored only as its SHA-256, under a grant that expires 30 days after the exchange, whatever happens. Using it arrives with #744; until then `grant_type=refresh_token` answers `unsupported_grant_type`.

Errors are RFC 6749 JSON, `{"error": "...", "error_description": "..."}`: `invalid_client` (401) for a client that fails to authenticate, `invalid_grant` for a code that is unknown, expired, already used, issued to another client or redirect URI, or presented with the wrong verifier — the first presentation that gets past client authentication spends the code, and presenting it again revokes the grant it produced — and `invalid_request` or `unsupported_grant_type` for a malformed request. See [docs/adr/0011-token-endpoint-and-access-tokens.md](./docs/adr/0011-token-endpoint-and-access-tokens.md).

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
  [--first-party] [--guest-login-allowed] \
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
| `--scope`                    | Repeatable allow-list of what the client may request. Defaults to `openid`.          |
| `--audience`                 | The `aud` of its access tokens, naming the resource server. Defaults to the id.      |

A redirect URI is matched by exact string comparison, so it must be registered exactly as the client will send it: `https://app.example` and `https://app.example/` are two different registrations.

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
