import { base64url } from 'jose'
import { describe, expect, it } from 'vitest'
import type { CasClientOptions } from './cas-client'
import { createCasClient, UnusableGrantError } from './cas-client'
import { ApiError } from './client'
import { DiscoveryError } from './errors'
import type { CasStub, TokenAnswer } from './test-support/cas'
import {
  basicCredentials,
  casStub,
  CLIENT_ID,
  CLIENT_SECRET,
  gate,
  KID,
  POST_LOGOUT_REDIRECT_URI,
  REDIRECT_URI,
  SUB,
  untilAborted,
} from './test-support/cas'

const seconds = (): number => Math.floor(Date.now() / 1000)

const casClient = (cas: CasStub, overrides: Partial<CasClientOptions> = {}) =>
  createCasClient({
    issuer: cas.issuer,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    fetch: cas.fetch,
    ...overrides,
  })

/** `BASE64URL(SHA256(verifier))`, recomputed here rather than taken from the code under test. */
const challengeOf = async (codeVerifier: string): Promise<string> =>
  base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))))

const queryOf = (url: string): Record<string, string> => Object.fromEntries(new URL(url).searchParams)

const endpointOf = (url: string): string => {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}

/** A code exchange whose ID token the stub builds as `answer` says, with the request's own `nonce` by default. */
const exchangeWith = async (cas: CasStub, answer: TokenAnswer = {}) => {
  const client = casClient(cas)
  const request = await client.authorizationRequest()
  cas.answer({ ...answer, claims: { nonce: request.nonce, ...answer.claims } })
  return await client.exchangeCode({ code: 'the-code', codeVerifier: request.codeVerifier, nonce: request.nonce })
}

describe('authorizationRequest', () => {
  it('builds the request of §4 at the endpoint the document advertises, with PKCE S256', async () => {
    const cas = await casStub()

    const request = await casClient(cas).authorizationRequest()

    expect(endpointOf(request.url)).toBe(cas.document.authorization_endpoint)
    expect(queryOf(request.url)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile',
      state: request.state,
      nonce: request.nonce,
      code_challenge: await challengeOf(request.codeVerifier),
      code_challenge_method: 'S256',
    })
    // RFC 7636 §4.1: the verifier is 43 to 128 characters.
    expect(request.codeVerifier).toHaveLength(43)
  })

  it('sends the scope it was given, the client default otherwise', async () => {
    const cas = await casStub()

    const asked = await casClient(cas).authorizationRequest({ scope: 'openid profile email' })
    expect(queryOf(asked.url).scope).toBe('openid profile email')

    const configured = await casClient(cas, { scope: 'openid' }).authorizationRequest()
    expect(queryOf(configured.url).scope).toBe('openid')
  })

  it('carries `id_token_hint` and `prompt` only when they are given', async () => {
    const cas = await casStub()

    const plain = await casClient(cas).authorizationRequest()
    expect(queryOf(plain.url)).not.toHaveProperty('id_token_hint')
    expect(queryOf(plain.url)).not.toHaveProperty('prompt')

    const upgrade = await casClient(cas).authorizationRequest({ idTokenHint: 'the-hint', prompt: 'none' })
    expect(queryOf(upgrade.url)).toMatchObject({ id_token_hint: 'the-hint', prompt: 'none' })
  })

  it('generates a `state`, a `nonce` and a verifier of its own for every request', async () => {
    const cas = await casStub()
    const client = casClient(cas)

    const first = await client.authorizationRequest()
    const second = await client.authorizationRequest()

    expect(second.state).not.toBe(first.state)
    expect(second.nonce).not.toBe(first.nonce)
    expect(second.codeVerifier).not.toBe(first.codeVerifier)
  })
})

describe('exchangeCode', () => {
  it('sends the form of §5 to the discovered token endpoint and returns the validated tokens', async () => {
    const cas = await casStub()
    const client = casClient(cas)
    const request = await client.authorizationRequest()
    cas.answer({ claims: { nonce: request.nonce, picture: undefined } })

    const tokens = await client.exchangeCode({ code: 'the-code', codeVerifier: request.codeVerifier, nonce: request.nonce })

    expect(cas.tokenRequests).toHaveLength(1)
    expect(cas.tokenRequests[0]?.body).toBe(
      `grant_type=authorization_code&code=the-code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code_verifier=${request.codeVerifier}`,
    )
    expect(tokens).toMatchObject({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 600,
      scope: 'openid profile',
      profile: { sub: SUB, accountType: 'full', displayName: 'Ada', avatarUrl: null },
    })
    expect(tokens.claims).toMatchObject({ sub: SUB, aud: CLIENT_ID, iss: cas.issuer, nonce: request.nonce })
  })

  it('authenticates with `client_secret_basic`, each half percent-encoded as RFC 6749 §2.3.1 says', async () => {
    const cas = await casStub()
    // A secret whose characters a form decode would otherwise change: the round trip must be exact.
    const clientSecret = 'a b+c/d:e%f&g'
    const client = casClient(cas, { clientSecret })
    const request = await client.authorizationRequest()
    cas.answer({ claims: { nonce: request.nonce } })

    await client.exchangeCode({ code: 'the-code', codeVerifier: request.codeVerifier, nonce: request.nonce })

    expect(basicCredentials(cas.tokenRequests[0]?.authorization ?? null)).toEqual({ clientId: CLIENT_ID, clientSecret })
  })

  it('reaches the token endpoint the document advertises, not the path the description embeds', async () => {
    const issuer = 'https://cas.example'
    const cas = await casStub({ documentPatch: { token_endpoint: `${issuer}/elsewhere/token` } })

    await expect(exchangeWith(cas)).resolves.toMatchObject({ accessToken: 'access-1' })

    expect(cas.asked(`${issuer}/elsewhere/token`)).toBe(1)
    expect(cas.asked(`${issuer}/oidc/token`)).toBe(0)
  })
})

describe('the ID token of an exchange', () => {
  it('refuses one that is not a JWS at all', async () => {
    const cas = await casStub()

    await expect(exchangeWith(cas, { idToken: 'not-a-token' })).rejects.toMatchObject({ name: 'InvalidIdTokenError', code: 'malformed' })
  })

  it('refuses an access token in the `id_token` slot', async () => {
    const cas = await casStub()

    await expect(exchangeWith(cas, { header: { typ: 'at+jwt' } })).rejects.toMatchObject({ name: 'InvalidIdTokenError', code: 'wrong_typ' })
  })

  it('refuses `alg: none` and every algorithm the document does not publish', async () => {
    const none = await casStub()
    await expect(exchangeWith(none, { idToken: none.craftedIdToken({ alg: 'none', typ: 'JWT', kid: KID }) })).rejects.toMatchObject({
      code: 'alg_not_allowed',
    })

    const rs256 = await casStub()
    await expect(exchangeWith(rs256, { idToken: rs256.craftedIdToken({ alg: 'RS256', typ: 'JWT', kid: KID }) })).rejects.toMatchObject({
      code: 'alg_not_allowed',
    })
  })

  it('refuses a `kid` still unpublished after the one refetch, without looping', async () => {
    const cas = await casStub({ keySets: [[]] })

    await expect(exchangeWith(cas)).rejects.toMatchObject({ name: 'InvalidIdTokenError', code: 'unknown_kid' })
    expect(cas.asked(cas.jwksUri)).toBe(2)
  })

  it('refuses one signed by another key published under the same `kid`', async () => {
    const cas = await casStub()

    await expect(exchangeWith(cas, { signWith: cas.otherKey })).rejects.toMatchObject({ code: 'invalid_signature' })
  })

  it('refuses another issuer and another client', async () => {
    const other = await casStub()
    await expect(exchangeWith(other, { claims: { iss: 'https://other.example' } })).rejects.toMatchObject({ code: 'wrong_issuer' })

    const stranger = await casStub()
    await expect(exchangeWith(stranger, { claims: { aud: 'another-client' } })).rejects.toMatchObject({ code: 'wrong_audience' })
  })

  it('refuses one with no `exp`, one whose `exp` is not a number, and an expired one', async () => {
    const without = await casStub()
    await expect(exchangeWith(without, { claims: { exp: undefined } })).rejects.toMatchObject({ code: 'invalid_exp' })

    const text = await casStub()
    await expect(exchangeWith(text, { claims: { exp: '2026-10-20T00:00:00Z' } })).rejects.toMatchObject({ code: 'invalid_exp' })

    const past = await casStub()
    await expect(exchangeWith(past, { claims: { exp: seconds() - 1 } })).rejects.toMatchObject({ code: 'expired' })
  })

  it('refuses a `nonce` that is not the request’s, and a missing one where it is expected', async () => {
    const wrong = await casStub()
    await expect(exchangeWith(wrong, { claims: { nonce: 'another-nonce' } })).rejects.toMatchObject({ code: 'nonce_mismatch' })

    const missing = await casStub()
    await expect(exchangeWith(missing, { claims: { nonce: undefined } })).rejects.toMatchObject({ code: 'nonce_mismatch' })
  })

  it('refuses a claim set this package cannot read', async () => {
    const withoutAccountType = await casStub()
    await expect(exchangeWith(withoutAccountType, { claims: { account_type: undefined } })).rejects.toMatchObject({
      name: 'InvalidIdTokenError',
      code: 'missing_claims',
    })

    const withoutSub = await casStub()
    await expect(exchangeWith(withoutSub, { claims: { sub: undefined } })).rejects.toMatchObject({ code: 'missing_claims' })
  })
})

describe('the profile snapshot', () => {
  it('maps the standard `picture` claim to `avatarUrl`, and null when CAS releases none', async () => {
    const released = await casStub()
    await expect(exchangeWith(released, { claims: { picture: 'https://cdn.example/ada.png' } })).resolves.toMatchObject({
      profile: { avatarUrl: 'https://cdn.example/ada.png' },
    })

    const today = await casStub()
    await expect(exchangeWith(today)).resolves.toMatchObject({ profile: { avatarUrl: null } })
  })

  it('has no display name for a guest, which CAS never releases one for', async () => {
    const cas = await casStub()

    await expect(exchangeWith(cas, { claims: { account_type: 'guest', amr: ['anon'], name: undefined } })).resolves.toMatchObject({
      profile: { accountType: 'guest', displayName: null, avatarUrl: null },
    })
  })
})

describe('refresh', () => {
  it('sends the form of §7 and validates an ID token that carries no `nonce`', async () => {
    const cas = await casStub()
    cas.answer({ claims: { nonce: undefined } })

    const tokens = await casClient(cas).refresh('the-refresh-token')

    expect(cas.tokenRequests[0]?.body).toBe('grant_type=refresh_token&refresh_token=the-refresh-token')
    expect(tokens).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1', scope: 'openid profile' })
  })

  it('reports the granted scopes the answer names, not the ones that were asked for', async () => {
    const cas = await casStub()
    cas.answer({ claims: { nonce: undefined }, scope: 'openid profile email' })

    await expect(casClient(cas).refresh('the-refresh-token')).resolves.toMatchObject({ scope: 'openid profile email' })
  })

  it('carries the rotated tokens out with a refusal of the ID token they came in', async () => {
    const cas = await casStub()
    cas.answer({ signWith: cas.otherKey, claims: { nonce: undefined } })

    const failure = await casClient(cas)
      .refresh('the-refresh-token')
      .then(
        () => undefined,
        (error: unknown) => error,
      )

    // The 200 spent `the-refresh-token` (ADR 0012 (b)), so a caller that is told nothing of the new one is left
    // holding a token CAS reads as stolen the next time it is presented.
    expect(failure).toBeInstanceOf(UnusableGrantError)
    expect(failure).toMatchObject({ code: 'unusable_grant', grant: { refreshToken: 'refresh-1', accessToken: 'access-1', expiresIn: 600 } })
    expect((failure as UnusableGrantError).cause).toMatchObject({ name: 'InvalidIdTokenError', code: 'invalid_signature' })
  })
})

describe('guestGrant', () => {
  it('sends the URN grant type of §8, with a scope only when one is given', async () => {
    const cas = await casStub()
    const client = casClient(cas)
    cas.answer(
      { claims: { account_type: 'guest', amr: ['anon'], name: undefined } },
      { claims: { account_type: 'guest', amr: ['anon'], name: undefined } },
    )

    const guest = await client.guestGrant()
    await client.guestGrant({ scope: 'openid' })

    expect(cas.tokenRequests[0]?.body).toBe('grant_type=urn%3Amemebattle%3Aoauth%3Agrant-type%3Aguest')
    expect(cas.tokenRequests[1]?.body).toBe('grant_type=urn%3Amemebattle%3Aoauth%3Agrant-type%3Aguest&scope=openid')
    expect(guest.profile).toMatchObject({ accountType: 'guest', displayName: null })
  })

  it('surfaces the rate limit of §8 as a typed error carrying its `Retry-After`', async () => {
    const cas = await casStub()
    cas.answer({ failure: { status: 429, error: 'rate_limit_exceeded', headers: { 'Retry-After': '60' } } })

    await expect(casClient(cas).guestGrant()).rejects.toMatchObject({
      name: 'TokenEndpointError',
      code: 'rate_limit_exceeded',
      status: 429,
      retryAfterSeconds: 60,
    })
  })
})

describe('a refusal from the token endpoint', () => {
  it('surfaces the codes the description declares, with their statuses', async () => {
    const over = await casStub()
    over.answer({ failure: { status: 400, error: 'invalid_grant' } })
    await expect(casClient(over).refresh('retired')).rejects.toMatchObject({ name: 'TokenEndpointError', code: 'invalid_grant', status: 400 })

    const away = await casStub()
    away.answer({ failure: { status: 503, error: 'temporarily_unavailable' } })
    await expect(casClient(away).refresh('whatever')).rejects.toMatchObject({
      code: 'temporarily_unavailable',
      status: 503,
      retryAfterSeconds: undefined,
    })
  })

  it('leaves what is outside the contract as the transport reported it', async () => {
    const cas = await casStub()
    cas.answer({ raw: { status: 502, body: '<html>Bad gateway</html>', headers: { 'Content-Type': 'text/html' } } })

    await expect(casClient(cas).refresh('whatever')).rejects.toMatchObject({ name: 'ApiError', status: 502, code: 'unknown' })
  })
})

describe('endSessionUrl', () => {
  it('builds the navigation of §11 at the endpoint the document advertises', async () => {
    const cas = await casStub()

    const url = await casClient(cas).endSessionUrl({ idTokenHint: 'the-id-token' })

    expect(endpointOf(url)).toBe(cas.document.end_session_endpoint)
    expect(queryOf(url)).toEqual({ id_token_hint: 'the-id-token', post_logout_redirect_uri: POST_LOGOUT_REDIRECT_URI })
  })

  it('appends `state` only when one is given', async () => {
    const cas = await casStub()

    const url = await casClient(cas).endSessionUrl({ idTokenHint: 'the-id-token', state: 'the-state' })

    expect(queryOf(url).state).toBe('the-state')
  })
})

describe('a document that does not advertise an endpoint this client sends to', () => {
  it('is refused as malformed metadata, rather than read as an `undefined` URL', async () => {
    const withoutAuthorization = await casStub({ documentPatch: { authorization_endpoint: undefined } })
    await expect(casClient(withoutAuthorization).authorizationRequest()).rejects.toMatchObject({
      name: 'DiscoveryError',
      code: 'malformed_metadata',
    })

    const withoutEndSession = await casStub({ documentPatch: { end_session_endpoint: undefined } })
    await expect(casClient(withoutEndSession).endSessionUrl({ idTokenHint: 'the-id-token' })).rejects.toMatchObject({ code: 'malformed_metadata' })

    // The quietest of the three on its own: a form `POST` to a wrong URL instead of a refusal of the metadata.
    const withoutToken = await casStub({ documentPatch: { token_endpoint: undefined } })
    await expect(casClient(withoutToken).refresh('the-refresh-token')).rejects.toMatchObject({ code: 'malformed_metadata' })
    expect(withoutToken.tokenRequests).toEqual([])
  })
})

describe('the request timeout', () => {
  const TIMEOUT_MS = 20

  /** The stub's `fetch`, with the request to `url` stalled until the caller's deadline fires. */
  const stalledAt =
    (cas: CasStub, url: string): typeof globalThis.fetch =>
    async (input, init) =>
      String(input) === url ? await untilAborted(init?.signal) : await cas.fetch(input, init)

  const failureOf = async (call: Promise<unknown>): Promise<unknown> =>
    await call.then(
      () => undefined,
      (error: unknown) => error,
    )

  it('fails a token call CAS holds past the bound as `unreachable`, and lets one answered in time through', async () => {
    const cas = await casStub()
    cas.answer({ until: gate().promise })

    const thrown = await failureOf(casClient(cas, { requestTimeoutMs: TIMEOUT_MS }).guestGrant())

    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({ code: 'unreachable', status: 0, cause: { name: 'TimeoutError' } })
    expect(thrown instanceof ApiError && thrown.message).toContain(`${TIMEOUT_MS} ms`)

    const held = gate()
    cas.answer({ until: held.promise, claims: { account_type: 'guest', amr: ['anon'], name: undefined } })
    const granted = casClient(cas, { requestTimeoutMs: 1_000 }).guestGrant()
    held.release()

    await expect(granted).resolves.toMatchObject({ accessToken: 'access-1' })
  })

  it('keeps the rotated grant when the keys to validate a refreshed ID token outlive the bound', async () => {
    const cas = await casStub()
    const client = casClient(cas, { requestTimeoutMs: TIMEOUT_MS, fetch: stalledAt(cas, cas.jwksUri) })

    const thrown = await failureOf(client.refresh('seed-refresh'))

    expect(thrown).toBeInstanceOf(UnusableGrantError)
    expect(thrown).toMatchObject({ grant: { refreshToken: 'refresh-1', accessToken: 'access-1' } })
    const cause = thrown instanceof UnusableGrantError ? thrown.cause : undefined
    expect(cause).toBeInstanceOf(DiscoveryError)
    expect(cause).toMatchObject({ code: 'discovery_unavailable', cause: { name: 'ApiError', code: 'unreachable', cause: { name: 'TimeoutError' } } })
  })

  it('fails a discovery read that outlives the bound as unreadable metadata, the timeout underneath', async () => {
    const cas = await casStub()
    const client = casClient(cas, { requestTimeoutMs: TIMEOUT_MS, fetch: stalledAt(cas, `${cas.issuer}/.well-known/openid-configuration`) })

    const thrown = await failureOf(client.authorizationRequest())

    expect(thrown).toBeInstanceOf(DiscoveryError)
    expect(thrown).toMatchObject({ code: 'discovery_unavailable', cause: { name: 'ApiError', code: 'unreachable', cause: { name: 'TimeoutError' } } })
  })

  it('refuses at construction a bound no runtime can honour as it stands', async () => {
    const cas = await casStub()

    for (const requestTimeoutMs of [0, 0.5, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648, '20']) {
      // A string comes from an environment variable nobody parsed; the type says number, the configuration may not.
      const make = (): unknown => casClient(cas, { requestTimeoutMs: requestTimeoutMs as number })
      expect(make).toThrow(TypeError)
      expect(make).toThrow(/integer from 1 to 2147483647/)
    }
    for (const requestTimeoutMs of [1, 2_147_483_647, undefined]) {
      expect(() => casClient(cas, { requestTimeoutMs })).not.toThrow()
    }
  })
})
