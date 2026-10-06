# Integrating an application with CAS

How an application in the MemeBattle ecosystem uses CAS as its identity
provider: what to register, which library to pick, and what each protocol
interaction asks of the application. It is written from the application's
side, in the order a developer meets the steps. The full rule behind each
step lives in a section of the [README](../README.md) or in an ADR, and the
text links to it rather than restating it; where this guide and those
documents seem to differ, they and the code are right.

The guide is backed by an executable version of itself: the reference
client test in [`tests/reference_client/`](../tests/reference_client/), a
relying party that knows nothing but the issuer and its own registration
(section 14).

The running example is an application called `example`, whose backend
serves `http://localhost:4000`, against a CAS whose issuer is
`http://localhost:3000`. Substitute your own id, origin and issuer.

## 1. What CAS gives you, and who does what

CAS is an OpenID Connect provider: it signs users in with passkeys and hands
your application signed tokens that say who they are. Three parties of
yours take part, and each has one job.

- **The browser** starts the sign-in by navigating to CAS's authorization
  endpoint, comes back to your callback with a code, and, to sign out,
  navigates to CAS's end-session endpoint. It never holds the client secret
  and never holds a refresh token.
- **Your backend** is a *confidential client*: it holds the client secret,
  builds the authorization request, exchanges the code, keeps and rotates
  the refresh token, mints guests, and gives the browser whatever session
  your application uses.
- **Your resource servers** (the APIs and other services that the browser
  or your backend call with an access token) verify each access
  token locally against CAS's published keys. They never call CAS on the
  request path, so a CAS outage does not interrupt a session already open
  ([ADR 0011 (a)](adr/0011-token-endpoint-and-access-tokens.md)).

Why a confidential client rather than a public client in the browser: the
guest grant is open to confidential clients only
([ADR 0014 (a)](adr/0014-guest-accounts-and-the-guest-grant.md)); the
secret keeps the refresh chain on a server, where a script injected into
your pages cannot reach it; and `/oidc/token` sends no CORS headers for
other origins, so it is a backend-to-backend call anyway
([ADR 0011, Consequences](adr/0011-token-endpoint-and-access-tokens.md)).

The sign-in, end to end:

```
browser               your backend            CAS             CAS frontend
   | "sign in"              |                    |                    |
   |----------------------->|                    |                    |
   | 302 /oidc/authorize?state, PKCE, nonce      |                    |
   |<-----------------------|                    |                    |
   | GET /oidc/authorize ----------------------->|                    |
   | no CAS session: 302 /sign-in?return_to=...  |                    |
   |<--------------------------------------------|                    |
   | passkey sign-in or create-account ------------------------------>|
   | GET return_to (/oidc/authorize, signed in) >|                    |
   | 302 /auth/callback?code=...&state=...       |                    |
   |<--------------------------------------------|                    |
   | GET /auth/callback --->|                    |                    |
   |                        | POST /oidc/token ->|                    |
   |                        |<- access, ID and   |                    |
   |                        |   refresh tokens   |                    |
   |<- your own session ----|                    |                    |
```

What CAS does not do, so you do not look for it:

- No consent screen. Only first-party clients can be authorized today
  ([ADR 0010 (f)](adr/0010-authorization-endpoint.md)).
- No passwords. Accounts sign in with passkeys only.
- No token introspection and no revocation endpoint. An access token is
  honoured until it expires; revocation happens on the refresh side
  ([ADR 0011 (a)](adr/0011-token-endpoint-and-access-tokens.md),
  [ADR 0012](adr/0012-refresh-token-rotation.md)).
- No front- or back-channel logout. Signing out of CAS does not reach your
  application, and signing out of your application ends only what you end
  ([ADR 0013 (i)](adr/0013-userinfo-and-rp-initiated-logout.md)).

## 2. Register your client

Clients are registered by an operator with the `cas-client` binary, which
writes the `clients` table of the database `DATABASE_URL` names. There is no
self-service and no Dynamic Client Registration
([README, OIDC clients](../README.md#oidc-clients),
[ADR 0008](adr/0008-oidc-clients-registry.md)). The example application:

```sh
cd apps/cas
cargo run -p cas --bin cas-client -- register \
  --id example \
  --name Example \
  --kind confidential \
  --redirect-uri http://localhost:4000/auth/callback \
  --post-logout-redirect-uri http://localhost:4000/ \
  --first-party \
  --guest-login-allowed \
  --scope openid --scope profile --scope email \
  --audience example
```

The same origin, callback and audience are used in every section below.
`scripts/seed-dev.sh` registers a `ligretto` client with
`http://localhost:5173/oidc/callback`, but its redirect URIs are placeholders
until ligretto is wired to CAS (the script says so), and port 5173 is the
CAS frontend, whose dev server proxies `/oidc` to CAS: a callback there
would never reach your application. Register a client of your own.

What each choice means for the integration:

- `--kind confidential`: your backend authenticates to `/oidc/token` with a
  secret (section 3). A public client authenticates with PKCE alone and
  cannot use the guest grant.
- `--redirect-uri` is compared byte for byte with the `redirect_uri` of
  every authorization request: no prefix match, no wildcard, no tolerated
  trailing slash. `http://localhost:4000` and `http://localhost:4000/` are
  two registrations. Register each callback exactly as your backend will
  send it; the flag repeats
  ([ADR 0008 (c)](adr/0008-oidc-clients-registry.md)).
- `--post-logout-redirect-uri`: where logout may send the browser back,
  compared the same way (section 11).
- `--first-party`: the client skips consent. A client without it is refused
  with `unauthorized_client` at the authorization endpoint until consent
  exists ([ADR 0010 (f)](adr/0010-authorization-endpoint.md)).
- `--scope` is the allow-list of what the client may request, one scope per
  flag; without the flag it is `openid` alone. `openid` is required in every
  request; `profile` releases the display name as `name`; `email` releases
  the account's address, always with `email_verified: false` because
  addresses are not verified
  ([ADR 0007](adr/0007-account-email.md)).
- `--audience` is the `aud` of the client's access tokens: the name your
  resource servers check (section 6). It is a contract with them, not a
  property of the client, so it is worth spelling out even when it equals
  the id, which is the default
  ([ADR 0011 (b)](adr/0011-token-endpoint-and-access-tokens.md)).
- `--guest-login-allowed` lets the client mint guest accounts (section 8);
  `--guest-grants-per-minute <n>` caps them, default 60.

A confidential client's secret is generated by CAS and printed once, alone
on stdout (logs and errors go to stderr). Put it in your backend's secret
store at once: the table keeps only its hash, and there is no update,
rotation or deletion until the admin panel, so a lost secret or a wrong
redirect URI is fixed by registering another id
([ADR 0008 (b), (e)](adr/0008-oidc-clients-registry.md)).

## 3. Choose a library

Use an OpenID Connect relying-party library and configure it from
discovery, as the reference client does: give it the issuer, let it fetch
`{issuer}/.well-known/openid-configuration` and take every endpoint and
algorithm from there. CAS advertises everything such a library needs, and
the library must support it:

- the Authorization Code flow with PKCE, method `S256`. PKCE is mandatory
  for every client, confidential ones included
  ([ADR 0010 (b)](adr/0010-authorization-endpoint.md));
- client authentication with `client_secret_basic` or `client_secret_post`
  ([ADR 0011 (f)](adr/0011-token-endpoint-and-access-tokens.md));
- ID-token validation against the document's `jwks_uri` with `ES256`, the
  only advertised algorithm
  ([ADR 0009 (a)](adr/0009-signing-key-and-discovery.md));
- the `refresh_token` grant;
- the `end_session_endpoint` (RP-Initiated Logout).

Hard-code no path: the endpoints live under `{issuer}/oidc/`, but the
document is what says so
([ADR 0017](adr/0017-oidc-endpoints-under-a-prefix.md),
[README, OIDC discovery](../README.md#oidc-discovery)). The issuer you
configure must be byte-identical to the document's `issuer`, without a
trailing slash; a library compares the two
([ADR 0009 (e)](adr/0009-signing-key-and-discovery.md)).

Two things no library does for you, and your backend writes by hand:

- **the guest grant**, an extension grant: one form `POST` to the token
  endpoint (section 8);
- **the access-token check on a resource server**, if your library verifies
  ID tokens but does not expose a plain JWS verification. It is a short
  function (section 6).

Examples, not prescriptions:
[`openidconnect`](https://crates.io/crates/openidconnect) for Rust, which
the reference client uses, and
[`openid-client`](https://www.npmjs.com/package/openid-client) for Node,
an OpenID-certified relying-party library that fits an AdonisJS backend.

Whatever HTTP client your backend uses for its requests to CAS must not
follow redirects. `openidconnect` requires it, against server-side request
forgery: a redirect in an answer must not make your backend send a request,
credentials included, to an address nobody configured. The reference client
builds its client that way (`http_client` in
[`relying_party.rs`](../tests/reference_client/relying_party.rs)).

## 4. Sign-in

Your backend builds the authorization request and sends the browser to it
with a `302`. The parameters, all in the query of a `GET` to the document's
`authorization_endpoint`
([README, Authorization endpoint](../README.md#authorization-endpoint),
[ADR 0010 (b)](adr/0010-authorization-endpoint.md)):

```
GET http://localhost:3000/oidc/authorize
  ?client_id=example
  &redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fauth%2Fcallback
  &response_type=code
  &scope=openid%20profile%20email
  &state=<random, at most 512 bytes>
  &code_challenge=<BASE64URL(SHA256(code_verifier))>
  &code_challenge_method=S256
  &nonce=<random, at most 512 bytes>
```

- `redirect_uri` is required even with one registered callback, and must
  equal a registered one byte for byte.
- `scope` is space-separated, includes `openid`, and stays within the
  client's `--scope` list; anything else is `invalid_scope`.
- `state` is required. Keep it with the `code_verifier` and the `nonce` in
  your backend's own session for this browser, to check the callback.
- `nonce` is optional; send it, and check it in the ID token (section 5).
- `prompt=none` is honoured: with a CAS session the browser comes straight
  back with a code; without one it comes back with `error=login_required`
  instead of seeing the sign-in screen. That is how a backend checks for an
  existing CAS session without showing anything. During a guest upgrade
  without a session the answer is `login_required` too, since registering
  a passkey is UI (section 9). See `prompt_none` in
  [`src/oidc/authorization.rs`](../src/oidc/authorization.rs).
- `id_token_hint` starts the guest upgrade (section 9).

What CAS does with the request:

- **Without a CAS session** the browser goes to the CAS frontend's
  `/sign-in?return_to=<the /oidc/authorize path and query>`. The user signs
  in or creates an account there, and the frontend sends the browser back
  to the request on its own. Your application does nothing in between.
- **With a session**, a first-party client gets a code at the callback,
  with the request's `state`. The code is valid for 60 seconds and once
  ([ADR 0010 (d)](adr/0010-authorization-endpoint.md)).

Errors come back on two channels, decided by whether CAS can trust your
redirect URI yet ([ADR 0010 (a)](adr/0010-authorization-endpoint.md)):

- An unknown `client_id`, or a `redirect_uri` that is missing or not
  registered, gets an HTML error page from CAS and no redirect: sending
  anything to an unverified address is an open redirect. During
  development this means a typo in the registration; in production your
  application never sees it. A database failure while CAS is still looking
  up the client is on this side too: a `503` page (`service_unavailable`),
  not a redirect, so your callback does not see every outage.
- Everything after the client and the redirect URI are verified comes back
  to the callback as `error`, `error_description` and `state`, a database
  failure included (`temporarily_unavailable`).

Your callback therefore checks, in this order: `state` equals the one you
stored for this browser (otherwise drop the request, it is not yours);
then `error`, which means the sign-in failed and is shown as such
(`login_required` after `prompt=none` means "not signed in to CAS", not a
failure); then exchanges `code`.

Parameters CAS does not implement are refused rather than ignored, through
the callback, so a library that sends one by default must be told not to:
`max_age` and every `prompt` value other than `none` alone are
`invalid_request`, a `response_mode` other than `query` is
`invalid_request`, `request` is `request_not_supported`, `request_uri` is
`request_uri_not_supported` (discovery says
`request_uri_parameter_supported: false`, and the reference client checks
the refusal in
[`main.rs`](../tests/reference_client/main.rs)), `registration` is
`registration_not_supported`. Hints such as `login_hint`, `ui_locales` or
`display` are ignored ([ADR 0010 (b)](adr/0010-authorization-endpoint.md)).

## 5. Exchange the code

Your backend redeems the code at the token endpoint, with the same
`redirect_uri` and the PKCE verifier
([README, Token endpoint](../README.md#token-endpoint),
[ADR 0011](adr/0011-token-endpoint-and-access-tokens.md)):

```
POST /oidc/token HTTP/1.1
Host: localhost:3000
Authorization: Basic base64(urlencode("example") ":" urlencode(<secret>))
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<the code>
&redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fauth%2Fcallback
&code_verifier=<the verifier>
```

`client_secret_post` sends `client_id` and `client_secret` in the body
instead; sending the secret both ways is `invalid_request`. A failed client
authentication is `401 invalid_client`.

```
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 600,
  "refresh_token": "<opaque>",
  "id_token": "<JWT>",
  "scope": "openid profile email"
}
```

Validate the ID token before you trust anything in it. A library does this
for you when it is configured from discovery: signature with a key of the
discovered JWKS (the header's `kid`), `alg` among
`id_token_signing_alg_values_supported` (`ES256`), `iss` equal to the
issuer, `aud` equal to your `client_id`, `exp` in the future, and `nonce`
equal to the one you sent (`claims` in
[`relying_party.rs`](../tests/reference_client/relying_party.rs)).

Then read it:

- `sub` is the account id, a UUID, stable for the life of the account and
  the same for every client (`subject_types_supported: ["public"]`). Key
  your application's data on it.
- `name`, the display name, with the `profile` scope, for a full account
  only.
- `email` and `email_verified: false`, with the `email` scope, when the
  account has an address.
- `amr` (`["webauthn"]`, or `["anon"]` for a guest) and `account_type`
  (`full` or `guest`), always.

The access and ID tokens live 10 minutes. The refresh token belongs to a
grant that ends 30 days after this exchange, whatever happens; store it on
the server, next to the user's session in your application, never in the
browser.

The `invalid_grant` answers that matter here
([ADR 0011 (f)](adr/0011-token-endpoint-and-access-tokens.md)):

- One description covers a code that is unknown, expired, already used,
  voided because the user signed out of CAS before it was redeemed, or
  issued to another client or redirect URI. The remedy is a new
  authorization request.
- A wrong `code_verifier` has a description of its own, because it is the
  integration bug you most need named; the code is spent by then.
- Do not retry an exchange that reached the code. The first presentation
  that gets past client authentication spends the code, whatever its
  outcome, and a second presentation is treated as a stolen code: it
  revokes the grant the first one produced, refresh token included. A lost
  answer is therefore a new authorization request, not a retry.
- Two kinds of answer leave the code unspent. A database failure rolls the
  whole exchange back (`503 temporarily_unavailable`, or `500 server_error`
  for a failure CAS cannot classify), so the same request may be sent again
  while the code's 60 seconds last
  ([ADR 0011 (f)](adr/0011-token-endpoint-and-access-tokens.md)). A request
  refused before the code is read (`invalid_client`, `invalid_request`,
  `unsupported_grant_type`) spends nothing either, but it is a bug in the
  request, fixed in code rather than retried.

## 6. Verify access tokens on a resource server

A resource server receives `Authorization: Bearer <access token>` and
verifies the token itself, with nothing but the discovery document and the
JWKS. The access token is an ES256 JWT (RFC 9068). The check is the one
`verify_access_token` in
[`relying_party.rs`](../tests/reference_client/relying_party.rs) runs, in
its order, plus the JWKS refetch a long-running server needs:

```
verify(token, issuer, audience):
  header_b64, payload_b64, signature_b64 = token.split(".")
  header  = json(base64url_decode(header_b64))
  payload = json(base64url_decode(payload_b64))
  require header.typ == "at+jwt"           # an ID token says "JWT": refuse it
  require header.alg in discovery.id_token_signing_alg_values_supported
                                            # ES256, never the token's choice
  key = jwks.find(kid = header.kid)
  if key is missing:
      jwks = refetch(discovery.jwks_uri)   # once: the key may be new
      key  = jwks.find(kid = header.kid) or refuse
  require verify_es256(key, header_b64 + "." + payload_b64,
                       base64url_decode(signature_b64))   # r || s, 64 bytes
  require payload.iss == issuer            # the configured issuer, exactly
  require payload.aud == audience          # your client's --audience
  require payload.exp > now
  return payload
```

Each line has a reason:

- `typ: at+jwt` is what tells an access token from an ID token; one key
  signs both, so without it an ID token would pass as an access token
  ([ADR 0011 (a)](adr/0011-token-endpoint-and-access-tokens.md)).
- `alg` is taken from the document, never from the token's own choice:
  `none` and every other algorithm are refused.
- `aud` is the audience registered for the client (section 2), not the
  client id. A token minted for another resource server is refused by
  yours, and yours by it
  ([ADR 0011 (b)](adr/0011-token-endpoint-and-access-tokens.md)).

Then the claims: `sub` (the account id), `client_id` (the client that
obtained the token), `scope` (space-separated), `jti`, `amr` (`["webauthn"]`
or `["anon"]`) and `account_type` (`full` or `guest`). Treat a guest as a
guest from the claim alone; there is nothing to look up.

The discovery document and the JWKS are served with
`Cache-Control: public, max-age=3600`. Cache the JWKS, refetch it on that
schedule, and refetch once when a token names a `kid` you do not have. A
signing-key rotation then needs nothing from you: the new key is published
an hour or more before it signs anything, and the old one stays published
long after it stops
([README, Signing key and rotation](../README.md#signing-key-and-rotation),
[ADR 0009 (d)](adr/0009-signing-key-and-discovery.md)).

An access token cannot be revoked and nobody asks CAS about it: it is good
until `exp`, at most 10 minutes. A user who signed out of your application,
or a guest who just upgraded, can still present a token issued before, and
it still says what it said then (`account_type: "guest"` after an upgrade,
for instance). If a resource server needs to forget a user sooner, that is
your application's own state, not CAS's
([ADR 0011 (a)](adr/0011-token-endpoint-and-access-tokens.md),
[ADR 0015 (h)](adr/0015-guest-upgrade.md)).

## 7. Refresh

Before the access token expires, your backend refreshes, with the same
client authentication as the exchange
([README, Token endpoint](../README.md#token-endpoint),
[ADR 0012](adr/0012-refresh-token-rotation.md)):

```
POST /oidc/token HTTP/1.1
Authorization: Basic ...
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<the current refresh token>
```

The answer is the same set as the exchange: a new access token, a new ID
token and a **new refresh token**. Every refresh retires the token it
presented. Presenting a retired token again is treated as theft: it revokes
the whole grant, so the token the rotation just issued stops working too,
and there is no grace window
([ADR 0012 (b)](adr/0012-refresh-token-rotation.md)). Two rules follow for
your backend:

- **Persist the new refresh token before you use the new access token.** If
  the answer is lost after CAS rotated, the old token is spent and the next
  attempt with it signs the user out of that grant.
- **One refresh in flight per grant.** Two requests, two tabs or two
  replicas of your backend refreshing the same token at once is a reuse,
  and the second one revokes the grant. Serialise refreshes per grant, with
  a lock where the token is stored:

```
refresh(session):
  with lock(session.grant):        # one refresh per grant, across replicas
    if session.access_token_still_fresh(): return
    tokens = POST token_endpoint(grant_type=refresh_token,
                                 refresh_token=session.refresh_token)
    session.store(tokens.refresh_token, tokens.access_token, tokens.id_token)
```

A `scope` on refresh may repeat or narrow the grant's scopes, but a narrower
scope is ignored: the response and the new access token carry the grant's
full scopes, and the response's `scope` says so. Read the returned `scope`
rather than assuming the request narrowed anything. Asking for a scope the
grant does not hold is `invalid_scope`
([ADR 0012 (c)](adr/0012-refresh-token-rotation.md)).

`invalid_grant` on refresh has one description for a token that is unknown,
expired, revoked, already used or another client's. It always means the
same thing: this grant is over. Sign the user in again (for a guest, mint a
new one, section 8); never retry with the same token
([ADR 0012 (e)](adr/0012-refresh-token-rotation.md)).

The grant's 30-day end is absolute: refreshing never moves it. Signing out
of CAS does not end it either; a grant is not tied to the CAS session
([ADR 0012 (g)](adr/0012-refresh-token-rotation.md)). The refreshed ID
token carries the account's claims as they are now (a changed display name
arrives here), and no `nonce`, since there was no authorization request
([ADR 0012 (f)](adr/0012-refresh-token-rotation.md)).

## 8. Guests

A user can start before they have an account. Your backend mints a guest
with the guest grant, with no browser involved and no UI from CAS
([README, Token endpoint](../README.md#token-endpoint),
[ADR 0014](adr/0014-guest-accounts-and-the-guest-grant.md)):

```
POST /oidc/token HTTP/1.1
Authorization: Basic ...
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Amemebattle%3Aoauth%3Agrant-type%3Aguest
```

The grant type is `urn:memebattle:oauth:grant-type:guest`, listed in the
document's `grant_types_supported`. This is the one request the reference
client builds by hand (`guest` in
[`relying_party.rs`](../tests/reference_client/relying_party.rs)); the
answer is an ordinary token response and goes through the library like
any other.

- Only a confidential client registered with `--guest-login-allowed` may
  use it; any other authenticated client gets `400 unauthorized_client`.
- `scope` is optional and defaults to `openid` alone. A guest has no name
  and no address, so `profile` and `email` would release nothing; ask for
  them when the guest upgrades (section 9).
- Past the client's `--guest-grants-per-minute` the answer is
  `429 rate_limit_exceeded` with `Retry-After: 60`. Tell the user that
  continuing as a guest is unavailable for now and retry no sooner than
  `Retry-After`; never retry in a loop.

The tokens are those of section 5, with `amr: ["anon"]` and
`account_type: "guest"`, and never a `name`: CAS gives each guest a
generated display name of its own, but it is not one the user chose, so
it is not released. Show your own label for a guest.

A guest's grant is an ordinary grant: it refreshes exactly as in section 7
and ends 30 days after the guest was minted, so the guest can be refreshed
for 30 days and no longer unless the user creates an account (section 9).
Offer the upgrade before then. The tokens of the last refresh stay valid
for up to 10 more minutes, and so does its ID token as an upgrade hint
([ADR 0014 (c)](adr/0014-guest-accounts-and-the-guest-grant.md)). An
upgrade already started with such a hint can still finish: its upgrade
session on CAS lasts an hour from when it was opened, whatever the hint's
expiry ([ADR 0015 (b), (d)](adr/0015-guest-upgrade.md)). Past both, nothing
reaches the guest again, and the only way on is a new guest, with a new
`sub`. Key the guest's data on
`sub` from the start: an upgrade keeps it.

## 9. Upgrade a guest to a full account

When a guest chooses to create an account, your backend upgrades the guest
in place, keeping its `sub`, through the authorization endpoint with the
guest's ID token as `id_token_hint`
([README, Token endpoint](../README.md#token-endpoint),
[ADR 0015](adr/0015-guest-upgrade.md)):

```
force_refresh(session):                        # section 7, without the skip
  with lock(session.grant):
    tokens = POST token_endpoint(grant_type=refresh_token,
                                 refresh_token=session.refresh_token)
    session.store(tokens.refresh_token, tokens.access_token, tokens.id_token)
    return tokens

upgrade(guest_session):
  tokens = force_refresh(guest_session)        # always: a fresh ID token
  request = authorization_request(             # section 4, as usual
      scope = "openid profile email",
      id_token_hint = tokens.id_token)
  redirect browser to request
  # the user registers a passkey on CAS; the callback receives a code
  new = exchange(code)                          # section 5
  if new.id_token.sub != guest_session.sub:
      handle "signed in as another account"     # see below
  else:
      replace every token of guest_session with new
```

- **The hint must be unexpired.** An ID token lives 10 minutes, and this
  one opens a session on CAS, so CAS checks its `exp` strictly. Refresh the
  guest just before building the link, even when its access token is still
  fresh, and never reuse a stored ID token
  ([ADR 0015 (c)](adr/0015-guest-upgrade.md)).
- **What the user sees.** Without a CAS session the browser goes to the
  CAS frontend's create-account screen under a restricted upgrade session;
  the user registers a passkey and the frontend follows `return_to` back
  to the request, which now yields a code at your callback. `return_to`
  never carries the hint.
- **The result.** The new tokens carry the same `sub`, with
  `account_type: "full"`, `amr: ["webauthn"]` and, with `profile`, the name
  the user chose.
- **The old tokens.** The upgrade revokes every grant of the guest, so the
  guest's refresh token is now `invalid_grant`; carry on with the tokens of
  the new code. Access tokens issued to the guest before keep saying
  `guest` until they expire, at most 10 minutes.

The refusals, all through the callback:

- `invalid_request` with `error_description` `id_token_hint is invalid` (not
  an ID token CAS issued to this client) or `id_token_hint has expired`.
  The remedy for either is to refresh and build the link again. A hint is
  checked whatever session the browser holds.
- `login_required`, when the request also carried `prompt=none`.

Two cases do not upgrade the guest, and both are by design:

- A hint naming a full account, or an account that no longer exists, is
  ignored: the request proceeds as an ordinary sign-in.
- A browser **already signed in to CAS** gets a code for the account it is
  signed in to, and the guest stays a guest. Your backend must compare the
  new ID token's `sub` with the guest's and handle the difference
  explicitly: the user signed in to an existing account, and what your
  application does with the guest's data (merge it, offer to, or leave it)
  is your decision.

## 10. Userinfo

The userinfo endpoint answers the account's claims as they are now, for an
access token ([README, Userinfo endpoint](../README.md#userinfo-endpoint),
[ADR 0013 (b)–(e)](adr/0013-userinfo-and-rp-initiated-logout.md)):

```
GET /oidc/userinfo HTTP/1.1
Authorization: Bearer <access token>

HTTP/1.1 200 OK
Cache-Control: no-store

{
  "sub": "...",
  "account_type": "full",
  "name": "Ada",
  "email": "ada@example.com",
  "email_verified": false
}
```

`name` comes with `profile` (never for a guest), `email` with `email`.

At sign-in you do not need it: the ID token already has the same claims,
released by the same rule. Call it when you want the claims later without
refreshing, or from the browser: it is the one `/oidc` route open to any
origin through CORS, without credentials, so a page holding an access token
may call it directly. It takes any unexpired CAS access token with the
`openid` scope, whatever its `aud`, and only in the `Authorization`
header, never in the query or the body.

Errors follow RFC 6750. No Bearer header (or a header of another scheme)
is `401` with a bare `WWW-Authenticate: Bearer` and no body. The others
carry the code in the challenge and in a JSON body: a malformed header
`400 invalid_request`, an invalid or expired token `401 invalid_token`, a
token without `openid` `403 insufficient_scope`.

## 11. Logout

Signing a user out has two halves, and CAS does only the second
([README, End session](../README.md#end-session-rp-initiated-logout),
[ADR 0013 (f)–(i)](adr/0013-userinfo-and-rp-initiated-logout.md)).

**Your application ends its own session.** CAS's logout touches no grant
and no refresh token, so your backend forgets the refresh token and the
session it belongs to. The grant then simply runs out.

**The browser is signed out of CAS** by a top-level navigation, a `GET`, to
the document's `end_session_endpoint`:

```
GET http://localhost:3000/oidc/end_session
  ?id_token_hint=<the ID token of the session being ended>
  &post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A4000%2F
  &state=<random>
```

- `id_token_hint` is **required**: send the ID token of the application
  session being ended, the latest one you hold. CAS accepts any ID token it
  issued to your client, expired or not, because after an idle hour that is
  all you have, as long as the key that signed it is still published. A
  retired key stays published for 30 days after it stops signing, longer
  than a CAS session can live ([README, Signing key and
  rotation](../README.md#signing-key-and-rotation)); a hint signed by a key
  dropped after that gets CAS's error page and ends nothing, and the user
  signs out from CAS's own dashboard
  ([ADR 0013 (a)](adr/0013-userinfo-and-rp-initiated-logout.md)). CAS
  ends the browser's CAS session only when that session belongs to the
  hint's `sub`; a session of another account is left alone,
  and the browser is redirected all the same. A successful redirect
  therefore does not prove the browser was signed out of CAS
  (`end_session` in
  [`src/oidc/http/end_session.rs`](../src/oidc/http/end_session.rs)).
- `post_logout_redirect_uri` must be one you registered, byte for byte.
  Without it the browser goes to the CAS frontend's root.
- `state` is appended to `post_logout_redirect_uri`; check it as at the
  callback.
- `client_id` is optional; if sent it must be the hint's `aud`.

Use `GET`. The CAS session cookie is `SameSite=Lax`, so a form `POST` from
another site reaches CAS without the cookie, validates, redirects and ends
nothing ([ADR 0013 (h)](adr/0013-userinfo-and-rp-initiated-logout.md)).

Every refusal (a missing or invalid hint, a mismatched `client_id`, an
unregistered `post_logout_redirect_uri`, a repeated parameter) is an HTML
error page on CAS, never a redirect, and ends nothing.

## 12. Errors

Each endpoint reports errors in the shape its specification fixes
([ADR 0016 (h), (i)](adr/0016-openapi-description.md)):

- `/oidc/token` answers RFC 6749 JSON,
  `{"error": "...", "error_description": "..."}`, `400`, or `401` for
  `invalid_client` and `429` for `rate_limit_exceeded`.
- `/oidc/userinfo` answers RFC 6750: a refused token or header carries the
  code both in `WWW-Authenticate` and in the same JSON body. Two answers
  carry one of the two only: a missing Bearer header is a bare challenge
  with no body, and a database failure is the JSON body with no challenge,
  since no token was refused.
- `/oidc/authorize` sends `error`, `error_description` and `state` to your
  callback once your redirect URI is trusted, and an HTML page before that.
- `/oidc/end_session` answers every refusal with an HTML page.

A database failure is `503 temporarily_unavailable` (try again) on the token
and userinfo endpoints. At the authorization endpoint it depends on when it
happens: before the client and the redirect URI are verified it is a `503`
HTML page on CAS (`service_unavailable`), after that a redirect to your
callback with `temporarily_unavailable`. Anything CAS did not anticipate is
`server_error` or a `500`.

Branch on `error`, never on `error_description`: the codes are stable, the
descriptions are for the developer reading a log. This guide names the
codes each flow needs; the full list of codes per endpoint and status is in
the OpenAPI description, under `x-error-codes` on every error response,
served at `GET /openapi.json` and committed as
[`openapi.json`](../openapi.json) ([README, OpenAPI](../README.md#openapi)).

## 13. Local development

To run your application against a local CAS:

1. Start Postgres and apply the migrations, from `apps/cas`
   ([README, Database (local dev)](../README.md#database-local-dev),
   [README, Migrations](../README.md#migrations)):

   ```sh
   cd apps/cas
   docker compose up -d
   cargo run -p cas --bin cas-migrate
   ```

2. Register your application with its own dev origin and callback, as in
   section 2. `scripts/seed-dev.sh` only seeds ligretto's placeholder
   client. Keep the printed secret in your application's local
   configuration.

3. Start CAS with `bacon run` (or `cargo run`) in `apps/cas`. It listens on
   `:3000`, and its issuer is `http://localhost:3000` ([README, Prepare
   bacon](../README.md#prepare-bacon-used-for-dev-server-reload)).

4. Start the CAS frontend, which serves the sign-in and create-account
   screens on `:5173`:

   ```sh
   pnpm --filter @memebattle/cas-frontend start:dev
   ```

   Its dev server proxies `/api` and `/oidc` to CAS
   ([cas-frontend docs/LAYOUT.md](../../cas-frontend/docs/LAYOUT.md)).

Every CAS setting has a development default
([README, Configuration](../README.md#configuration)). Three are the ones an
integrator may meet:

- `CAS_ISSUER`, the issuer your library is configured with, and the base of
  every endpoint in the document. Change it when your application reaches
  CAS at another address than `http://localhost:3000`, for example from a
  container.
- `CAS_ORIGIN`, the CAS frontend's origin, where the browser is sent to sign
  in. Change it when the frontend runs elsewhere than
  `http://localhost:5173`.
- `CAS_CORS_ORIGINS`, the origins allowed to call CAS from a browser with
  credentials: the CAS frontend, not your application. Your application's
  origin does not belong there; its backend calls `/oidc/token`, and
  `/oidc/userinfo` has an open policy of its own.

Development builds sign with a checked-in key, `apps/cas/dev/signing-key.pem`.
It is public and compiled into debug builds only; tokens it signed mean
nothing outside your machine
([ADR 0009 (c)](adr/0009-signing-key-and-discovery.md)).

## 14. Where to look next

- [`tests/reference_client/`](../tests/reference_client/): every flow of
  this guide as a relying party on `openidconnect`, configured from
  discovery alone. [`main.rs`](../tests/reference_client/main.rs) has the
  flows, [`relying_party.rs`](../tests/reference_client/relying_party.rs)
  the relying party, including `verify_access_token` and `guest`. Run it
  from `apps/cas` with Postgres up
  ([TESTS.md, The reference client](TESTS.md#the-reference-client)):

  ```sh
  DATABASE_URL=postgres://cas:cas@localhost:5434/cas cargo test --test reference_client
  ```

- [`openapi.json`](../openapi.json): every route, its bodies and its error
  codes.
- The decisions behind the protocol, one line each:
  - [ADR 0008](adr/0008-oidc-clients-registry.md): the clients registry,
    exact redirect-URI matching, the secret shown once, scopes and gates.
  - [ADR 0009](adr/0009-signing-key-and-discovery.md): the ES256 signing
    key, discovery, the JWKS and key rotation.
  - [ADR 0010](adr/0010-authorization-endpoint.md): the authorization
    endpoint, its two error channels, sign-in by redirect, 60-second codes.
  - [ADR 0011](adr/0011-token-endpoint-and-access-tokens.md): the token
    endpoint, the token claims, `aud` per client, lifetimes, client
    authentication.
  - [ADR 0012](adr/0012-refresh-token-rotation.md): refresh rotation, reuse
    as theft, scope on refresh, the grant's absolute end.
  - [ADR 0013](adr/0013-userinfo-and-rp-initiated-logout.md): userinfo and
    RP-initiated logout.
  - [ADR 0014](adr/0014-guest-accounts-and-the-guest-grant.md): guest
    accounts, the guest grant and its rate limit.
  - [ADR 0015](adr/0015-guest-upgrade.md): the guest upgrade through
    `id_token_hint`.
  - [ADR 0016](adr/0016-openapi-description.md): the OpenAPI description as
    the catalogue of error codes.
  - [ADR 0017](adr/0017-oidc-endpoints-under-a-prefix.md): the `/oidc`
    prefix, with the issuer and discovery at the root.
