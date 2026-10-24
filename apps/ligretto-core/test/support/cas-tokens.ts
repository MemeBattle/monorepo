/**
 * A CAS that publishes metadata and signs access tokens, for the suites that run the real `verifyAccessToken`: an
 * ES256 key pair, the discovery document and JWKS served through a `fetch` of its own, and a minter of RFC 9068 access
 * tokens with every claim the verifier requires. No network. `packages/ligretto-auth/src/test-support/cas.ts` is the
 * package's own stub, which it does not export; the discovery document's fields are copied from it.
 */
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import type { AccountType } from '@memebattle/ligretto-auth'

export const ISSUER = 'https://cas.example'
const KID = 'cas-test-key'
const JWKS_URI = `${ISSUER}/oidc/jwks.json`
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`

const document = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oidc/authorize`,
  token_endpoint: `${ISSUER}/oidc/token`,
  userinfo_endpoint: `${ISSUER}/oidc/userinfo`,
  end_session_endpoint: `${ISSUER}/oidc/end_session`,
  jwks_uri: JWKS_URI,
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token', 'urn:memebattle:oauth:grant-type:guest'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['ES256'],
  scopes_supported: ['openid', 'profile', 'email'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
  code_challenge_methods_supported: ['S256'],
  request_uri_parameter_supported: false,
}

const signing = await generateKeyPair('ES256', { extractable: true })
const jwks = { keys: [{ ...(await exportJWK(signing.publicKey)), kid: KID, use: 'sig', alg: 'ES256' }] }

export interface AccessTokenOptions {
  sub: string
  accountType?: AccountType
  aud?: string
  /** Epoch seconds; an hour from now by default. */
  exp?: number
}

/** An access token as CAS mints it: `typ: at+jwt`, ES256 under the published key, every claim the verifier reads. */
export const mintAccessToken = async ({ sub, accountType = 'full', aud = 'ligretto', exp }: AccessTokenOptions): Promise<string> => {
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({
    client_id: 'ligretto',
    scope: 'openid profile',
    amr: [accountType === 'guest' ? 'anon' : 'webauthn'],
    account_type: accountType,
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: KID })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setIssuedAt(now)
    .setExpirationTime(exp ?? now + 3600)
    .setJti(crypto.randomUUID())
    .sign(signing.privateKey)
}

export interface CasFetch {
  fetch: typeof globalThis.fetch
  /** From now on every request fails as an unreachable CAS does. */
  fail(): void
  /**
   * From now on every request stalls, as a CAS that accepted the connection and never answers: it settles only when
   * its signal aborts, and then rejects with the signal's reason, as a real `fetch` does.
   */
  stall(): void
}

/** The metadata of `ISSUER`, cacheable for an hour, through a `fetch` that can be switched to fail. */
export const casFetch = (): CasFetch => {
  let failing = false
  let stalling = false
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (failing) {
      throw new TypeError('fetch failed')
    }
    if (stalling) {
      const signal = init?.signal
      return await new Promise<never>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }
    const url = input instanceof Request ? input.url : String(input)
    const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' }
    if (url === DISCOVERY_URL) {
      return new Response(JSON.stringify(document), { headers })
    }
    if (url === JWKS_URI) {
      return new Response(JSON.stringify(jwks), { headers })
    }
    return new Response('not found', { status: 404 })
  }
  return {
    fetch,
    fail: () => {
      failing = true
    },
    stall: () => {
      stalling = true
    },
  }
}
