/**
 * Verifying an access token on a resource server, the check of
 * [INTEGRATION.md §6](../../../apps/cas/docs/INTEGRATION.md) in its order: `typ`, `alg` from the discovery document,
 * the key by `kid` with one refetch, the signature, `iss`, `aud`, and an `exp` in the future.
 *
 * Nothing is asked of CAS on the request path: the metadata is cached, so a CAS outage does not interrupt a session
 * already open (ADR 0011 (a)).
 */

import { decodeProtectedHeader, errors as joseErrors, importJWK, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'
import type { Client } from './client'
import { createClient } from './client'
import type { DiscoveryCache } from './discovery'
import { createDiscoveryCache } from './discovery'
import { DiscoveryError, InvalidTokenError } from './errors'
import type { AccountType } from './generated/models/AccountType'
import type { PublicJwk } from './generated/models/PublicJwk'
import { publishedKey } from './signing-key'

/** The claims of a verified access token (RFC 9068 §2.2, INTEGRATION.md §6). */
export interface AccessTokenClaims {
  /** The account id. */
  sub: string
  /** The client that obtained the token. */
  client_id: string
  /** The granted scopes, space-separated. */
  scope: string
  /** How the account authenticated: `["webauthn"]` or `["anon"]` (RFC 8176). */
  amr: string[]
  /** Whether the account has credentials of its own; a guest is a guest from this claim alone. */
  account_type: AccountType
  iss: string
  aud: string
  exp: number
  iat: number
  /** Unique per token, so a resource server that keeps a list can refuse a replay. */
  jti: string
}

export interface VerifyAccessTokenOptions {
  /** The issuer the token must name, and the one whose metadata is read. Byte-identical to CAS's own. */
  issuer: string
  /** This resource server's audience, as registered for the client — not a client id (ADR 0011 (b)). */
  audience: string
  /** The `fetch` the metadata is read with, for a runtime without a global one and for tests. */
  fetch?: typeof globalThis.fetch
  /** The metadata cache to read through. Defaults to one shared by the module. */
  cache?: DiscoveryCache
}

/** Shared by every call that does not bring its own: public documents, nothing of a user or a session in it. */
const sharedCache = createDiscoveryCache()

/** The published key the token names, refetching the JWKS once when the `kid` is unknown: the key may be new. */
const signingKey = async (kid: string | undefined, issuer: string, jwksUri: string, client: Client, cache: DiscoveryCache): Promise<PublicJwk> => {
  if (kid === undefined) {
    throw new InvalidTokenError('unknown_kid', 'The token names no `kid`, so no published key can be matched to it.')
  }
  const published = await publishedKey(kid, issuer, jwksUri, client, cache)
  if (published === undefined) {
    throw new InvalidTokenError('unknown_kid', `${issuer} publishes no key with the kid ${JSON.stringify(kid)}.`)
  }
  return published
}

/** jose's report of a failed verification, as one of this package's codes. */
const refusal = (cause: unknown): InvalidTokenError => {
  if (cause instanceof joseErrors.JWSSignatureVerificationFailed) {
    return new InvalidTokenError('invalid_signature', 'The signature does not match the published key.', { cause })
  }
  if (cause instanceof joseErrors.JOSEAlgNotAllowed) {
    return new InvalidTokenError('alg_not_allowed', 'The token is signed with an algorithm the provider does not publish.', { cause })
  }
  if (cause instanceof joseErrors.JWTExpired) {
    return new InvalidTokenError('expired', 'The token has expired.', { cause })
  }
  if (cause instanceof joseErrors.JWTClaimValidationFailed) {
    switch (cause.claim) {
      case 'iss':
        return new InvalidTokenError('wrong_issuer', 'The token names another issuer.', { cause })
      case 'aud':
        return new InvalidTokenError('wrong_audience', 'The token was minted for another audience.', { cause })
      case 'exp':
        return new InvalidTokenError('invalid_exp', 'The token has no numeric `exp`, which is required.', { cause })
      default:
        return new InvalidTokenError('malformed', `The claim \`${cause.claim}\` did not pass validation.`, { cause })
    }
  }
  return new InvalidTokenError('malformed', 'The token could not be read as a JWT.', { cause })
}

const isAccountType = (value: unknown): value is AccountType => value === 'guest' || value === 'full'

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(member => typeof member === 'string')

/** The verified payload as the claim set a resource server reads, or a refusal when it is not one. */
const claimsOf = (payload: JWTPayload): AccessTokenClaims => {
  const { sub, iss, aud, exp, iat, jti, client_id: clientId, scope, amr, account_type: accountType } = payload
  if (
    typeof sub !== 'string' ||
    typeof iss !== 'string' ||
    typeof aud !== 'string' ||
    typeof exp !== 'number' ||
    typeof iat !== 'number' ||
    typeof jti !== 'string' ||
    typeof clientId !== 'string' ||
    typeof scope !== 'string' ||
    !isStringArray(amr) ||
    !isAccountType(accountType)
  ) {
    throw new InvalidTokenError('malformed', 'The payload is not an access token claim set: a claim is missing or has the wrong type.')
  }
  return { sub, client_id: clientId, scope, amr, account_type: accountType, iss, aud, exp, iat, jti }
}

/**
 * The claims of `token`, or an `InvalidTokenError` naming the check it failed. A `DiscoveryError` instead means the
 * provider's metadata could not be read: the token was never judged.
 */
export const verifyAccessToken = async (token: string, options: VerifyAccessTokenOptions): Promise<AccessTokenClaims> => {
  const { issuer, audience, cache = sharedCache } = options
  const client = createClient({ baseUrl: issuer, fetch: options.fetch })

  let header
  try {
    header = decodeProtectedHeader(token)
  } catch (cause) {
    throw new InvalidTokenError('malformed', 'The token is not a JWS with a decodable protected header.', { cause })
  }

  // An ID token says `JWT`, and one key signs both: this is the only check that tells the two apart (ADR 0011 (a)).
  if (header.typ !== 'at+jwt') {
    throw new InvalidTokenError('wrong_typ', `An access token says \`typ: at+jwt\`; this one says ${JSON.stringify(header.typ)}.`)
  }

  // The algorithm comes from the document, never from the token's own choice: this is what refuses `none`.
  const document = await cache.discovery(issuer, client)
  const algorithms = document.id_token_signing_alg_values_supported
  if (header.alg === undefined || !algorithms.includes(header.alg)) {
    throw new InvalidTokenError('alg_not_allowed', `${issuer} does not publish the algorithm ${JSON.stringify(header.alg)}.`)
  }

  const published = await signingKey(header.kid, issuer, document.jwks_uri, client, cache)
  let key
  try {
    key = await importJWK(published, header.alg)
  } catch (cause) {
    // The cache refuses a set before storing it unless every key imports for the `alg` it names, so what is left here
    // is the narrower case: the document lets the token name an algorithm this key is not published for. Either way a
    // key WebCrypto will not take is the provider's metadata failing, not a judgement on the token.
    throw new DiscoveryError('unusable_key', `The key ${JSON.stringify(header.kid)} that ${issuer} publishes cannot verify ${header.alg}.`, { cause })
  }

  try {
    // `requiredClaims` makes `exp` mandatory: jose otherwise validates it only when the token carries it.
    const { payload } = await jwtVerify(token, key, { algorithms, issuer, audience, requiredClaims: ['exp'], clockTolerance: 0 })
    return claimsOf(payload)
  } catch (cause) {
    if (cause instanceof InvalidTokenError) {
      throw cause
    }
    throw refusal(cause)
  }
}
