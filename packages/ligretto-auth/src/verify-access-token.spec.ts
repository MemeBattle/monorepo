import { base64url, exportJWK, generateKeyPair, SignJWT } from 'jose'
import type { CryptoKey } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createDiscoveryCache } from './discovery'
import type { Discovery } from './generated/models/Discovery'
import type { PublicJwk } from './generated/models/PublicJwk'
import { verifyAccessToken } from './verify-access-token'

const ISSUER = 'https://cas.example'
const AUDIENCE = 'https://ligretto.example/api'
const KID = 'cas-2026-10'
const SUB = '8f14e45f-ceea-467a-9a1c-7f5a2a1cc001'
const JTI = '2b1f1c7e-0b3d-4a6c-9a41-2f2f9b1c0a77'
const MAX_AGE = 'public, max-age=3600'

const seconds = (): number => Math.floor(Date.now() / 1000)

const document = (issuer: string, jwksUri: string): Discovery => ({
  issuer,
  authorization_endpoint: `${issuer}/oidc/authorize`,
  token_endpoint: `${issuer}/oidc/token`,
  userinfo_endpoint: `${issuer}/oidc/userinfo`,
  end_session_endpoint: `${issuer}/oidc/end_session`,
  jwks_uri: jwksUri,
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['ES256'],
  scopes_supported: ['openid', 'profile'],
  token_endpoint_auth_methods_supported: ['client_secret_basic'],
  code_challenge_methods_supported: ['S256'],
  request_uri_parameter_supported: false,
})

interface ProviderOptions {
  issuer?: string
  /** What the document advertises; defaults to the OpenAPI path under the issuer. */
  jwksUri?: string
  /** What the document calls itself; defaults to the issuer it is served for. */
  documentIssuer?: string
  /** The successive JWKS answers; the last one repeats. */
  keySets?: PublicJwk[][]
  /** `null` serves no `Cache-Control` at all. */
  cacheControl?: string | null
  /** A status for the discovery endpoint to fail with instead of serving the document. */
  discoveryStatus?: number
}

/** A CAS that serves its metadata and nothing else, counting what was asked of it. */
const provider = (key: PublicJwk, options: ProviderOptions = {}) => {
  const issuer = options.issuer ?? ISSUER
  const jwksUri = options.jwksUri ?? `${issuer}/oidc/jwks.json`
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`
  const served = { ...document(issuer, jwksUri), issuer: options.documentIssuer ?? issuer }
  const keySets = options.keySets ?? [[key]]
  const cacheControl = options.cacheControl === undefined ? MAX_AGE : options.cacheControl

  const requested: string[] = []
  let jwksAnswers = 0

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: cacheControl === null ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', 'Cache-Control': cacheControl },
    })

  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
    const url = String(input)
    requested.push(url)
    if (url === discoveryUrl) {
      return options.discoveryStatus === undefined
        ? json(200, served)
        : json(options.discoveryStatus, { error: { code: 'internal_error', message: 'The document could not be built' } })
    }
    if (url === jwksUri) {
      const keys = keySets[Math.min(jwksAnswers, keySets.length - 1)]
      jwksAnswers += 1
      return json(200, { keys })
    }
    throw new Error(`Nothing is published at ${url}`)
  })

  return { fetch, requested, issuer, jwksUri, discoveryUrl, asked: (url: string) => requested.filter(seen => seen === url).length }
}

/** A clock a test moves by hand, so an expiry is reached without waiting for it. */
const clock = (start = 1_793_000_000_000) => {
  let value = start
  return { now: () => value, advance: (ms: number) => void (value += ms) }
}

const asPublicJwk = async (key: CryptoKey, kid: string): Promise<PublicJwk> =>
  ({ ...(await exportJWK(key)), kid, use: 'sig', alg: 'ES256' }) as PublicJwk

interface TokenOverrides {
  header?: Record<string, unknown>
  payload?: Record<string, unknown>
}

const CLAIMS = {
  sub: SUB,
  client_id: 'ligretto',
  scope: 'openid profile',
  amr: ['webauthn'],
  account_type: 'full',
  jti: JTI,
  iss: ISSUER,
  aud: AUDIENCE,
}

const accessToken = (key: CryptoKey, { header = {}, payload = {} }: TokenOverrides = {}): Promise<string> =>
  new SignJWT({ ...CLAIMS, iat: seconds(), exp: seconds() + 600, ...payload })
    .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: KID, ...header })
    .sign(key)

/** A compact JWS assembled by hand, for headers no signer would produce. */
const crafted = (header: Record<string, unknown>, payload: Record<string, unknown> = {}, signature = ''): string =>
  `${base64url.encode(JSON.stringify(header))}.${base64url.encode(JSON.stringify({ ...CLAIMS, iat: seconds(), exp: seconds() + 600, ...payload }))}.${signature}`

let signing: { privateKey: CryptoKey; publicKey: CryptoKey }
let other: { privateKey: CryptoKey; publicKey: CryptoKey }
let publicJwk: PublicJwk

beforeAll(async () => {
  signing = await generateKeyPair('ES256', { extractable: true })
  other = await generateKeyPair('ES256', { extractable: true })
  publicJwk = await asPublicJwk(signing.publicKey, KID)
})

/** A verification against `cas`, each with a cache of its own so one test never warms another. */
const verify = (token: string, cas: ReturnType<typeof provider>, cache = createDiscoveryCache()) =>
  verifyAccessToken(token, { issuer: cas.issuer, audience: AUDIENCE, fetch: cas.fetch, cache })

describe('verifyAccessToken', () => {
  it('returns the claims of a token signed by the published key', async () => {
    const cas = provider(publicJwk)
    const issued = { iat: seconds(), exp: seconds() + 600 }

    await expect(verify(await accessToken(signing.privateKey, { payload: issued }), cas)).resolves.toEqual({
      sub: SUB,
      client_id: 'ligretto',
      scope: 'openid profile',
      amr: ['webauthn'],
      account_type: 'full',
      iss: ISSUER,
      aud: AUDIENCE,
      jti: JTI,
      ...issued,
    })
  })

  it('refuses an ID token, which is the same key and says `typ: JWT`', async () => {
    const cas = provider(publicJwk)
    const idToken = await accessToken(signing.privateKey, { header: { typ: 'JWT' } })

    await expect(verify(idToken, cas)).rejects.toMatchObject({ name: 'InvalidTokenError', code: 'wrong_typ' })
    // The refusal comes before anything is asked of CAS.
    expect(cas.requested).toEqual([])
  })

  it('refuses `alg: none` and every algorithm the document does not publish', async () => {
    await expect(verify(crafted({ alg: 'none', typ: 'at+jwt', kid: KID }), provider(publicJwk))).rejects.toMatchObject({ code: 'alg_not_allowed' })
    await expect(verify(crafted({ alg: 'RS256', typ: 'at+jwt', kid: KID }), provider(publicJwk))).rejects.toMatchObject({ code: 'alg_not_allowed' })
  })

  it('refuses a token minted by another issuer', async () => {
    const token = await accessToken(signing.privateKey, { payload: { iss: 'https://other.example' } })

    await expect(verify(token, provider(publicJwk))).rejects.toMatchObject({ code: 'wrong_issuer' })
  })

  it('refuses a token minted for another resource server', async () => {
    const token = await accessToken(signing.privateKey, { payload: { aud: 'https://other.example/api' } })

    await expect(verify(token, provider(publicJwk))).rejects.toMatchObject({ code: 'wrong_audience' })
  })

  it('refuses an expired token, and one whose `exp` is exactly now', async () => {
    const past = await accessToken(signing.privateKey, { payload: { exp: seconds() - 1 } })
    await expect(verify(past, provider(publicJwk))).rejects.toMatchObject({ code: 'expired' })

    const edge = await accessToken(signing.privateKey, { payload: { exp: seconds() } })
    await expect(verify(edge, provider(publicJwk))).rejects.toMatchObject({ code: 'expired' })
  })

  it('refuses a token with no `exp` and one whose `exp` is not a number', async () => {
    const without = await accessToken(signing.privateKey, { payload: { exp: undefined } })
    await expect(verify(without, provider(publicJwk))).rejects.toMatchObject({ code: 'invalid_exp' })

    const text = await accessToken(signing.privateKey, { payload: { exp: '2026-10-20T00:00:00Z' } })
    await expect(verify(text, provider(publicJwk))).rejects.toMatchObject({ code: 'invalid_exp' })
  })

  it('refuses a token signed by another key published under the same `kid`', async () => {
    const token = await accessToken(other.privateKey)

    await expect(verify(token, provider(publicJwk))).rejects.toMatchObject({ code: 'invalid_signature' })
  })

  it('refetches the JWKS once when the `kid` is unknown, and accepts a key published meanwhile', async () => {
    const cas = provider(publicJwk, { keySets: [[], [publicJwk]] })

    await expect(verify(await accessToken(signing.privateKey), cas)).resolves.toMatchObject({ sub: SUB })
    expect(cas.asked(cas.jwksUri)).toBe(2)
  })

  it('refuses a `kid` that is still unpublished after the one refetch, without looping', async () => {
    const cas = provider(publicJwk, { keySets: [[]] })

    await expect(verify(await accessToken(signing.privateKey), cas)).rejects.toMatchObject({ code: 'unknown_kid' })
    expect(cas.asked(cas.jwksUri)).toBe(2)
  })
})

describe('the provider metadata', () => {
  it('keeps the path of an issuer that has one, and reads the JWKS where the document says', async () => {
    const issuer = 'https://cas.example/path'
    const cas = provider(publicJwk, { issuer, jwksUri: `${issuer}/oidc/jwks.json` })
    const token = await accessToken(signing.privateKey, { payload: { iss: issuer } })

    await expect(verifyAccessToken(token, { issuer, audience: AUDIENCE, fetch: cas.fetch, cache: createDiscoveryCache() })).resolves.toMatchObject({
      iss: issuer,
    })
    expect(cas.requested[0]).toBe('https://cas.example/path/.well-known/openid-configuration')
    expect(cas.requested[1]).toBe('https://cas.example/path/oidc/jwks.json')
  })

  it('reads the JWKS from `jwks_uri`, not from the path the description embeds, refetch included', async () => {
    const cas = provider(publicJwk, { jwksUri: `${ISSUER}/keys`, keySets: [[], [publicJwk]] })

    await expect(verify(await accessToken(signing.privateKey), cas)).resolves.toMatchObject({ sub: SUB })
    expect(cas.asked(`${ISSUER}/keys`)).toBe(2)
    expect(cas.asked(`${ISSUER}/oidc/jwks.json`)).toBe(0)
  })

  it('refuses a document that calls itself something else, and does not keep it', async () => {
    const cas = provider(publicJwk, { documentIssuer: `${ISSUER}/` })
    const cache = createDiscoveryCache()
    const token = await accessToken(signing.privateKey)

    await expect(verify(token, cas, cache)).rejects.toMatchObject({ name: 'DiscoveryError', code: 'issuer_mismatch' })
    await expect(verify(token, cas, cache)).rejects.toMatchObject({ code: 'issuer_mismatch' })
    expect(cas.asked(cas.discoveryUrl)).toBe(2)
  })

  it('reads the metadata once while its `max-age` lasts, and again after it', async () => {
    const cas = provider(publicJwk)
    const time = clock()
    const cache = createDiscoveryCache({ now: time.now })

    await verify(await accessToken(signing.privateKey), cas, cache)
    await verify(await accessToken(signing.privateKey), cas, cache)
    expect(cas.asked(cas.discoveryUrl)).toBe(1)
    expect(cas.asked(cas.jwksUri)).toBe(1)

    time.advance(3_600_001)
    await verify(await accessToken(signing.privateKey), cas, cache)
    expect(cas.asked(cas.discoveryUrl)).toBe(2)
    expect(cas.asked(cas.jwksUri)).toBe(2)
  })

  it('keeps nothing when the answer carries no `Cache-Control`', async () => {
    const cas = provider(publicJwk, { cacheControl: null })
    const cache = createDiscoveryCache()

    await verify(await accessToken(signing.privateKey), cas, cache)
    await verify(await accessToken(signing.privateKey), cas, cache)

    expect(cas.asked(cas.discoveryUrl)).toBe(2)
    expect(cas.asked(cas.jwksUri)).toBe(2)
  })

  it('reports an unreachable or failing provider as a discovery failure, not as a refused token', async () => {
    const failing = provider(publicJwk, { discoveryStatus: 500 })
    await expect(verify(await accessToken(signing.privateKey), failing)).rejects.toMatchObject({
      name: 'DiscoveryError',
      code: 'discovery_unavailable',
    })

    const unreachable = provider(publicJwk)
    unreachable.fetch.mockRejectedValue(new TypeError('fetch failed'))
    await expect(verify(await accessToken(signing.privateKey), unreachable)).rejects.toMatchObject({ code: 'discovery_unavailable' })
  })
})
