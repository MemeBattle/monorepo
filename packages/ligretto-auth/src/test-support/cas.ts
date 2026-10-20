/**
 * A CAS the specs talk to: its metadata, its keys and its token endpoint, over a `fetch` of its own. No network and
 * no server — the stub answers the requests the package sends and records what it was asked.
 *
 * It is not a spec file itself; it lives under `src/` so the type checker covers it, and nothing exports it from the
 * package. Three things make the session specs possible: real ES256-signed ID tokens, so the validator runs for
 * real; a scripted answer that can be **paused** until the test releases it, so a refresh and a callback race in a
 * fixed order; and refresh-token rotation enforced as CAS enforces it, so a second use of a retired token is
 * `invalid_grant` and an ordering bug fails loudly instead of passing.
 */

import { base64url, exportJWK, generateKeyPair, SignJWT } from 'jose'
import type { CryptoKey } from 'jose'
import type { Discovery } from '../generated/models/Discovery'
import type { PublicJwk } from '../generated/models/PublicJwk'

export const ISSUER = 'https://cas.example'
export const CLIENT_ID = 'ligretto'
export const CLIENT_SECRET = 'a-secret'
export const REDIRECT_URI = 'https://ligretto.example/auth/callback'
export const POST_LOGOUT_REDIRECT_URI = 'https://ligretto.example/'
export const KID = 'cas-2026-10'
export const SUB = '8f14e45f-ceea-467a-9a1c-7f5a2a1cc001'

const MAX_AGE = 'public, max-age=3600'
const ACCESS_TOKEN_LIFETIME_SECONDS = 600

const seconds = (): number => Math.floor(Date.now() / 1000)

/** A promise a test resolves by hand, to hold a scripted answer until the race it is arranging has happened. */
export interface Gate {
  promise: Promise<void>
  release: () => void
}

export const gate = (): Gate => {
  let release = (): void => undefined
  const promise = new Promise<void>(resolve => {
    release = () => resolve()
  })
  return { promise, release }
}

/** A token request as the stub saw it on the wire. */
export interface RecordedTokenRequest {
  authorization: string | null
  /** The body verbatim, for asserting the exact form that was sent. */
  body: string
  form: URLSearchParams
  grantType: string | null
}

/** A refusal the token endpoint answers with instead of tokens, in the RFC 6749 §5.2 shape CAS uses. */
export interface ScriptedFailure {
  status: number
  error: string
  description?: string
  headers?: Record<string, string>
}

/** One scripted answer of the token endpoint. Fields left out take the stub's defaults. */
export interface TokenAnswer {
  /** The answer waits for this before it is sent: how a test puts a request in flight and keeps it there. */
  until?: Promise<unknown>
  failure?: ScriptedFailure
  /** Overrides on the ID token's claims; a claim set to `undefined` is dropped from the payload. */
  claims?: Record<string, unknown>
  /** Overrides on the ID token's protected header. */
  header?: Record<string, unknown>
  /** Replaces the `id_token` field outright, for a value no signer would produce. */
  idToken?: string
  /** Signs the ID token with this key instead of the published one. */
  signWith?: CryptoKey
  scope?: string
  /** An answer served verbatim, for what is outside the contract: a proxy's HTML page rather than CAS's JSON. */
  raw?: { status: number; body: string; headers?: Record<string, string> }
}

export interface CasStubOptions {
  /** Fields to override in the document that is served; `undefined` drops one from the JSON. */
  documentPatch?: Record<string, unknown>
  /** The successive JWKS answers; the last one repeats. Defaults to the one published key. */
  keySets?: PublicJwk[][]
}

const documentOf = (issuer: string, jwksUri: string): Discovery => ({
  issuer,
  authorization_endpoint: `${issuer}/oidc/authorize`,
  token_endpoint: `${issuer}/oidc/token`,
  userinfo_endpoint: `${issuer}/oidc/userinfo`,
  end_session_endpoint: `${issuer}/oidc/end_session`,
  jwks_uri: jwksUri,
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token', 'urn:memebattle:oauth:grant-type:guest'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['ES256'],
  scopes_supported: ['openid', 'profile', 'email'],
  token_endpoint_auth_methods_supported: ['client_secret_basic'],
  code_challenge_methods_supported: ['S256'],
  request_uri_parameter_supported: false,
})

const asPublicJwk = async (key: CryptoKey, kid: string): Promise<PublicJwk> =>
  ({ ...(await exportJWK(key)), kid, use: 'sig', alg: 'ES256' }) as PublicJwk

/** The fields of an object that are not `undefined`: an override of `undefined` drops the claim it names. */
const present = (claims: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(claims).filter(([, value]) => value !== undefined))

export type CasStub = Awaited<ReturnType<typeof casStub>>

export const casStub = async (options: CasStubOptions = {}) => {
  const jwksUri = `${ISSUER}/oidc/jwks.json`
  const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`
  const served = { ...documentOf(ISSUER, jwksUri), ...options.documentPatch } as Discovery

  const signing = await generateKeyPair('ES256', { extractable: true })
  const other = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await asPublicJwk(signing.publicKey, KID)
  const keySets = options.keySets ?? [[publicJwk]]

  const requested: string[] = []
  const tokenRequests: RecordedTokenRequest[] = []
  const answers: TokenAnswer[] = []
  const issuedRefreshTokens: string[] = []
  /** The refresh tokens this CAS has already seen presented: a second presentation is theft (ADR 0012 (b)). */
  const retired = new Set<string>()
  let jwksAnswers = 0
  let issued = 0

  /** The default claim set of an ID token: a full account that signed in with a passkey. */
  const defaultClaims = (): Record<string, unknown> => ({
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: SUB,
    account_type: 'full',
    amr: ['webauthn'],
    name: 'Ada',
    iat: seconds(),
    exp: seconds() + ACCESS_TOKEN_LIFETIME_SECONDS,
  })

  /** An ID token signed by the published key, or by `signWith`. */
  const idToken = async ({ claims = {}, header = {}, signWith }: Pick<TokenAnswer, 'claims' | 'header' | 'signWith'> = {}): Promise<string> =>
    await new SignJWT(present({ ...defaultClaims(), ...claims }))
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: KID, ...header })
      .sign(signWith ?? signing.privateKey)

  /** A compact JWS assembled by hand, for a header no signer would produce (`alg: none`) or a signature that is none. */
  const craftedIdToken = (header: Record<string, unknown>, claims: Record<string, unknown> = {}, signature = ''): string =>
    `${base64url.encode(JSON.stringify(header))}.${base64url.encode(JSON.stringify(present({ ...defaultClaims(), ...claims })))}.${signature}`

  const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  const tokenAnswer = async (answer: TokenAnswer): Promise<Response> => {
    await answer.until
    if (answer.raw !== undefined) {
      return new Response(answer.raw.body, { status: answer.raw.status, headers: answer.raw.headers })
    }
    if (answer.failure !== undefined) {
      const { status, error, description, headers } = answer.failure
      return json(status, { error, error_description: description ?? error }, headers)
    }
    issued += 1
    const refreshToken = `refresh-${issued}`
    issuedRefreshTokens.push(refreshToken)
    return json(
      200,
      {
        access_token: `access-${issued}`,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
        refresh_token: refreshToken,
        id_token: answer.idToken ?? (await idToken(answer)),
        scope: answer.scope ?? 'openid profile',
      },
      { 'Cache-Control': 'no-store' },
    )
  }

  const serveToken = async (init: RequestInit | undefined): Promise<Response> => {
    const body = typeof init?.body === 'string' ? init.body : ''
    const form = new URLSearchParams(body)
    const grantType = form.get('grant_type')
    tokenRequests.push({ authorization: new Headers(init?.headers).get('authorization'), body, form, grantType })

    const presented = form.get('refresh_token')
    if (grantType === 'refresh_token' && presented !== null && retired.has(presented)) {
      // What CAS does with a reused token: the grant is revoked, and the caller is told the grant is over.
      return json(400, { error: 'invalid_grant', error_description: 'the refresh token was already used' })
    }

    const answer = answers.shift() ?? {}
    const response = await tokenAnswer(answer)
    if (response.status === 200 && grantType === 'refresh_token' && presented !== null) {
      retired.add(presented)
    }
    return response
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input)
    requested.push(url)
    if (url === discoveryUrl) {
      return json(200, served, { 'Cache-Control': MAX_AGE })
    }
    if (url === jwksUri) {
      const keys = keySets[Math.min(jwksAnswers, keySets.length - 1)]
      jwksAnswers += 1
      return json(200, { keys }, { 'Cache-Control': MAX_AGE })
    }
    if (url === served.token_endpoint) {
      return await serveToken(init)
    }
    throw new Error(`Nothing is published at ${url}`)
  }

  return {
    fetch,
    issuer: ISSUER,
    jwksUri,
    document: served,
    /** A key this CAS never published, for a signature that does not match the one it did. */
    otherKey: other.privateKey,
    /** Every token request it answered, in order. */
    tokenRequests,
    /** The refresh tokens it has handed out, in order. */
    issuedRefreshTokens,
    asked: (url: string): number => requested.filter(seen => seen === url).length,
    /** Scripts the next answers of the token endpoint; an unscripted request gets an ordinary success. */
    answer: (...scripted: TokenAnswer[]): void => void answers.push(...scripted),
    craftedIdToken,
  }
}

/** The `nonce` of an authorization URL: what the ID token answering it must carry. */
export const nonceOf = (url: string): string => new URL(url).searchParams.get('nonce') ?? ''

/** `Authorization: Basic …` decoded back to the credentials it carries, the way CAS decodes it. */
export const basicCredentials = (header: string | null): { clientId: string; clientSecret: string } | undefined => {
  const [scheme, encoded] = (header ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'basic' || encoded === undefined) {
    return undefined
  }
  const decoded = atob(encoded)
  const colon = decoded.indexOf(':')
  if (colon === -1) {
    return undefined
  }
  const formDecode = (value: string): string => decodeURIComponent(value.replaceAll('+', ' '))
  return { clientId: formDecode(decoded.slice(0, colon)), clientSecret: formDecode(decoded.slice(colon + 1)) }
}
