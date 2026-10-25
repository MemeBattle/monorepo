/**
 * The confidential client: what a backend sends CAS and what it gets back, the protocol half of
 * [INTEGRATION.md §4, §5, §7, §8 and §11](../../../apps/cas/docs/INTEGRATION.md).
 *
 * Every endpoint comes from the discovery document, never from a path written here; every token call is a form
 * `POST` through the generated `token` operation, authenticated with `client_secret_basic`; and every ID token is
 * validated before anything in it is read. The session rules built on top of this live in `./sessions`.
 *
 * Hand-written over the generated transport rather than taken from `openid-client`: its types are not the
 * description's, and `apps/cas/tests/reference_client` already proved CAS against a real library.
 */

import { base64url } from 'jose'
import type { Client } from './client'
import { atUrl, createClient } from './client'
import type { DiscoveryCache } from './discovery'
import { createDiscoveryCache } from './discovery'
import { TokenEndpointError } from './errors'
import type { TokenBody } from './generated/models/Token'
import type { TokenResponse } from './generated/models/TokenResponse'
import { token as tokenOperation } from './generated/operations/token'
import type { IdTokenClaims, ProfileSnapshot } from './id-token'
import { profileOf, validateIdToken } from './id-token'

/** The grant type of the guest grant (ADR 0014), listed in the document's `grant_types_supported`. */
const GUEST_GRANT_TYPE = 'urn:memebattle:oauth:grant-type:guest'

/** The scope an authorization request asks for when the caller names none: a sign-in wants the display name. */
const DEFAULT_SCOPE = 'openid profile'

/** The bytes of randomness behind a `state`, a `nonce` and a PKCE verifier: 32 of them are 43 base64url characters. */
const RANDOM_BYTES = 32

export interface CasClientOptions {
  /** The CAS issuer, byte-identical to the one its discovery document names. */
  issuer: string
  clientId: string
  /** Server-only: a confidential client's secret never reaches a browser (§1). */
  clientSecret: string
  /** The callback, which must equal a registered redirect URI byte for byte (§4). */
  redirectUri: string
  /** Where CAS sends the browser after a logout; registered, byte for byte (§11). */
  postLogoutRedirectUri: string
  /** The scope of an authorization request when none is given per call; defaults to `openid profile`. */
  scope?: string
  /** The `fetch` to send with, for a runtime without a global one and for tests. */
  fetch?: typeof globalThis.fetch
  /** The metadata cache to read through; defaults to one of this client's own. */
  cache?: DiscoveryCache
  /**
   * Bounds every request this client sends — discovery, JWKS and the token endpoint — from `fetch` to the end of the
   * body, so a caller holding a lock across a CAS call never waits unbounded
   * (`apps/ligretto-core-backend/docs/adrs/session-store-locking.md`). An integer from 1 to 2147483647 milliseconds, refused
   * at construction otherwise; no bound when left out. A request that outlives it is an `ApiError` `unreachable`,
   * which the handlers answer `503 cas_unavailable`.
   */
  requestTimeoutMs?: number
}

/** An authorization request as it was built: the URL to send the browser to, and what the callback is checked with. */
export interface AuthorizationRequest {
  url: string
  /** Keep it with the verifier and the nonce for this browser; the callback's `state` must equal it (§4). */
  state: string
  nonce: string
  codeVerifier: string
}

export interface AuthorizationRequestOptions {
  /** Overrides the client's default scope; space-separated and within the client's registered list. */
  scope?: string
  /** A guest's freshly issued ID token, which starts the upgrade (§9). Never a stored one (ADR 0015 (c)). */
  idTokenHint?: string
  /**
   * `none` asks CAS whether the browser already has a session, without showing anything (§4). It is the only value
   * CAS takes: every other one, `max_age` included, is answered `invalid_request` (§4).
   */
  prompt?: 'none'
}

/** The tokens of a grant as CAS answered them, before the ID token was read: nothing of the account yet. */
export interface Grant {
  accessToken: string
  refreshToken: string
  idToken: string
  /** Seconds the access token lives. */
  expiresIn: number
  /** The granted scopes, read from the response: a refresh never narrows them, whatever the request asked (§7). */
  scope: string
}

/** A grant's tokens as this package hands them on: the response's fields, with the ID token already validated. */
export interface Tokens extends Grant {
  claims: IdTokenClaims
  profile: ProfileSnapshot
}

export interface ExchangeCodeOptions {
  code: string
  /** The verifier of the authorization request this code answers. */
  codeVerifier: string
  /** The nonce of that request; the ID token must carry it. */
  nonce: string
}

export interface EndSessionUrlOptions {
  /** The ID token of the session being ended, the latest one held; required (§11). */
  idTokenHint: string
  /** Appended to the registered post-logout redirect URI; check it as at the callback. */
  state?: string
}

/**
 * A refresh CAS answered `200` whose ID token then failed validation — an unpublished `kid` in the middle of a key
 * rotation, a JWKS that could not be refetched, a clock a second ahead.
 *
 * The rotation has already happened: CAS retired the presented refresh token the moment it answered (ADR 0012 (b)).
 * So the new tokens leave with the failure instead of being dropped — a caller that loses them keeps a token CAS has
 * spent, and the next refresh presenting it is read as theft and revokes the whole grant. Nothing of the account
 * comes with them, since the claims they were carried in are not to be trusted; `cause` is the
 * `InvalidIdTokenError` or `DiscoveryError` that refused the ID token.
 */
export class UnusableGrantError extends Error {
  readonly code = 'unusable_grant'
  /** The rotated tokens. Record them before answering this failure; read nothing of the account from them. */
  readonly grant: Grant

  constructor(grant: Grant, options: ErrorOptions) {
    super('CAS rotated the grant, but the ID token it answered with cannot be accepted.', options)
    this.name = 'UnusableGrantError'
    this.grant = grant
  }
}

/** A backend's view of CAS: build a request, redeem a code, refresh, mint a guest, build the logout navigation. */
export interface CasClient {
  /** The authorization request of §4, with PKCE S256, a `state` and a `nonce` generated here. */
  authorizationRequest(options?: AuthorizationRequestOptions): Promise<AuthorizationRequest>
  /** The code exchange of §5. The ID token is validated against the `nonce` of its authorization request. */
  exchangeCode(options: ExchangeCodeOptions): Promise<Tokens>
  /**
   * The refresh of §7. Every call rotates the refresh token: persist the new one before using the new access token,
   * and persist it on an `UnusableGrantError` too — the rotation happened before the ID token was judged.
   */
  refresh(refreshToken: string): Promise<Tokens>
  /** The guest grant of §8, no browser involved. `scope` defaults to `openid` on CAS's side. */
  guestGrant(options?: { scope?: string }): Promise<Tokens>
  /** The end-session navigation of §11; the application ends its own session itself. */
  endSessionUrl(options: EndSessionUrlOptions): Promise<string>
}

/** 32 random bytes as base64url: a `state`, a `nonce`, or a PKCE verifier of 43 characters (RFC 7636 §4.1). */
const randomValue = (): string => base64url.encode(crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)))

/** `BASE64URL(SHA256(verifier))`, the `S256` challenge RFC 7636 §4.2 defines and CAS requires. */
const challengeOf = async (codeVerifier: string): Promise<string> =>
  base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))))

/**
 * `Basic base64(urlencode(client_id) ":" urlencode(secret))`, RFC 6749 §2.3.1 over RFC 7617. CAS form-decodes each
 * half strictly (`basic_credentials` in `apps/cas/src/oidc/token_request.rs`), so each half is percent-encoded here;
 * `encodeURIComponent` leaves only characters a form decode passes through unchanged.
 */
const basicAuthorization = (clientId: string, clientSecret: string): string =>
  `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`)}`

export const createCasClient = (options: CasClientOptions): CasClient => {
  const { issuer, clientId, clientSecret, redirectUri, postLogoutRedirectUri, scope: defaultScope = DEFAULT_SCOPE } = options
  const cache = options.cache ?? createDiscoveryCache()
  // The one transport every round trip goes through — `validateIdToken` and the discovery cache are handed it too —
  // so the timeout bounds them all.
  const transport: Client = createClient({ baseUrl: issuer, fetch: options.fetch, requestTimeoutMs: options.requestTimeoutMs })
  const authorization = basicAuthorization(clientId, clientSecret)

  /**
   * One form `POST` to the discovered token endpoint, `grant` the generated request type of its grant: the transport
   * encodes it as the form the operation declares. A failure CAS declared comes back from the transport as a value
   * and leaves here as a `TokenEndpointError`; anything outside the contract — the network, a proxy's page — passes
   * through as the transport reported it.
   */
  const postToken = async (grant: TokenBody): Promise<TokenResponse> => {
    const document = await cache.discovery(issuer, transport)
    const result = await tokenOperation({
      client: atUrl(transport, document.token_endpoint),
      body: grant,
      headers: { Authorization: authorization },
    })
    if (!result.ok) {
      throw new TokenEndpointError(result.error.code, result.error.status, result.error.message, { headers: result.error.headers })
    }
    return result.data
  }

  const grantOf = (response: TokenResponse): Grant => ({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    idToken: response.id_token,
    expiresIn: response.expires_in,
    scope: response.scope,
  })

  /** A token response with its ID token validated: nothing of it is read before the validation passes (§5). */
  const tokensOf = async (response: TokenResponse, nonce: string | undefined): Promise<Tokens> => {
    const claims = await validateIdToken(response.id_token, { issuer, clientId, nonce, client: transport, cache })
    return { ...grantOf(response), claims, profile: profileOf(claims) }
  }

  const authorizationRequest = async ({ scope, idTokenHint, prompt }: AuthorizationRequestOptions = {}): Promise<AuthorizationRequest> => {
    const document = await cache.discovery(issuer, transport)
    const state = randomValue()
    const nonce = randomValue()
    const codeVerifier = randomValue()

    const url = new URL(document.authorization_endpoint)
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', scope ?? defaultScope)
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('code_challenge', await challengeOf(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')
    if (idTokenHint !== undefined) {
      url.searchParams.set('id_token_hint', idTokenHint)
    }
    if (prompt !== undefined) {
      url.searchParams.set('prompt', prompt)
    }

    return { url: url.toString(), state, nonce, codeVerifier }
  }

  const exchangeCode = async ({ code, codeVerifier, nonce }: ExchangeCodeOptions): Promise<Tokens> =>
    await tokensOf(await postToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier }), nonce)

  const refresh = async (refreshToken: string): Promise<Tokens> => {
    // A 200 has already spent `refreshToken` (ADR 0012 (b)), whatever the ID token it came with turns out to be.
    const response = await postToken({ grant_type: 'refresh_token', refresh_token: refreshToken })
    try {
      // No nonce: the refreshed token answers no authorization request and carries none (ADR 0012 (f)).
      return await tokensOf(response, undefined)
    } catch (cause) {
      throw new UnusableGrantError(grantOf(response), { cause })
    }
  }

  const guestGrant = async ({ scope }: { scope?: string } = {}): Promise<Tokens> =>
    // `scope` goes on the wire only when asked for — an `undefined` is left out of the form — because CAS defaults a
    // guest to `openid`, and `profile` or `email` would release nothing (§8).
    await tokensOf(await postToken({ grant_type: GUEST_GRANT_TYPE, scope }), undefined)

  const endSessionUrl = async ({ idTokenHint, state }: EndSessionUrlOptions): Promise<string> => {
    const document = await cache.discovery(issuer, transport)
    const url = new URL(document.end_session_endpoint)
    url.searchParams.set('id_token_hint', idTokenHint)
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)
    if (state !== undefined) {
      url.searchParams.set('state', state)
    }
    return url.toString()
  }

  return { authorizationRequest, exchangeCode, refresh, guestGrant, endSessionUrl }
}
