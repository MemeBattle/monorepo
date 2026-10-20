/**
 * Validating an ID token, the check of [INTEGRATION.md §5](../../../apps/cas/docs/INTEGRATION.md) in its order:
 * `typ`, `alg` from the discovery document, the key by `kid` with one refetch, the signature, `iss`, `aud` (this
 * client's id), an `exp` in the future, and the `nonce` of the authorization request this token answers.
 *
 * Nothing in an ID token is trusted before it passes: the claims are where the account's `sub`, kind and display
 * name come from, and the sign-in is what they decide.
 */

import { decodeProtectedHeader, errors as joseErrors, importJWK, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'
import type { Client } from './client'
import type { DiscoveryCache } from './discovery'
import { DiscoveryError, InvalidIdTokenError } from './errors'
import type { AccountType } from './generated/models/AccountType'
import { publishedKey } from './signing-key'

/** The claims of a validated ID token (OpenID Connect Core §2, INTEGRATION.md §5 and §8). */
export interface IdTokenClaims {
  /** The account id, stable for the life of the account and the same for every client; an upgrade keeps it. */
  sub: string
  iss: string
  /** This client's id: an ID token's audience is the client, not a resource server (ADR 0011 (b)). */
  aud: string
  exp: number
  iat: number
  /** Whether the account has credentials of its own; a guest is a guest from this claim alone. */
  account_type: AccountType
  /** How the account authenticated: `["webauthn"]` or `["anon"]` (RFC 8176). */
  amr: string[]
  /** The display name, with the `profile` scope and for a full account only (§5, §8). */
  name?: string
  /** The standard picture claim. CAS releases none today; the mapping below is ready for when it does. */
  picture?: string
  /** The `nonce` of the authorization request; absent from a refreshed ID token (ADR 0012 (f)). */
  nonce?: string
}

/** What an application shows of an account, read off the ID token's claims and nothing else. */
export interface ProfileSnapshot {
  sub: string
  accountType: AccountType
  displayName: string | null
  avatarUrl: string | null
}

export interface ValidateIdTokenOptions {
  /** The issuer the token must name, and the one whose metadata is read. Byte-identical to CAS's own. */
  issuer: string
  /** This client's id, which the token's `aud` must be. */
  clientId: string
  /**
   * The `nonce` sent with the authorization request this token answers. Left out for a refresh and the guest grant,
   * where there was no authorization request and the token carries no `nonce` (ADR 0012 (f)); the claim is then
   * ignored rather than refused.
   */
  nonce?: string
  /** The transport the metadata is read with. */
  client: Client
  /** The metadata cache to read through. */
  cache: DiscoveryCache
}

/** jose's report of a failed verification, as one of this validator's codes. */
const refusal = (cause: unknown): InvalidIdTokenError => {
  if (cause instanceof joseErrors.JWSSignatureVerificationFailed) {
    return new InvalidIdTokenError('invalid_signature', 'The signature does not match the published key.', { cause })
  }
  if (cause instanceof joseErrors.JOSEAlgNotAllowed) {
    return new InvalidIdTokenError('alg_not_allowed', 'The token is signed with an algorithm the provider does not publish.', { cause })
  }
  if (cause instanceof joseErrors.JWTExpired) {
    return new InvalidIdTokenError('expired', 'The ID token has expired.', { cause })
  }
  if (cause instanceof joseErrors.JWTClaimValidationFailed) {
    switch (cause.claim) {
      case 'iss':
        return new InvalidIdTokenError('wrong_issuer', 'The token names another issuer.', { cause })
      case 'aud':
        return new InvalidIdTokenError('wrong_audience', 'The token was minted for another client.', { cause })
      case 'exp':
        return new InvalidIdTokenError('invalid_exp', 'The token has no numeric `exp`, which is required.', { cause })
      default:
        return new InvalidIdTokenError('missing_claims', `The claim \`${cause.claim}\` is missing or did not pass validation.`, { cause })
    }
  }
  return new InvalidIdTokenError('malformed', 'The token could not be read as a JWT.', { cause })
}

const isAccountType = (value: unknown): value is AccountType => value === 'guest' || value === 'full'

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(member => typeof member === 'string')

const isOptionalString = (value: unknown): value is string | undefined => value === undefined || typeof value === 'string'

/** The verified payload as the claim set this package reads, or a refusal when a claim is missing or has another type. */
const claimsOf = (payload: JWTPayload): IdTokenClaims => {
  const { sub, iss, aud, exp, iat, amr, account_type: accountType, name, picture, nonce } = payload
  if (
    typeof sub !== 'string' ||
    typeof iss !== 'string' ||
    typeof aud !== 'string' ||
    typeof exp !== 'number' ||
    typeof iat !== 'number' ||
    !isStringArray(amr) ||
    !isAccountType(accountType) ||
    !isOptionalString(name) ||
    !isOptionalString(picture) ||
    !isOptionalString(nonce)
  ) {
    throw new InvalidIdTokenError('missing_claims', 'The payload is not an ID token claim set: a claim is missing or has the wrong type.')
  }
  return { sub, iss, aud, exp, iat, amr, account_type: accountType, name, picture, nonce }
}

/**
 * The claims of `idToken`, or an `InvalidIdTokenError` naming the check it failed. A `DiscoveryError` instead means
 * the provider's metadata could not be read: the token was never judged.
 */
export const validateIdToken = async (idToken: string, options: ValidateIdTokenOptions): Promise<IdTokenClaims> => {
  const { issuer, clientId, nonce, client, cache } = options

  let header
  try {
    header = decodeProtectedHeader(idToken)
  } catch (cause) {
    throw new InvalidIdTokenError('malformed', 'The token is not a JWS with a decodable protected header.', { cause })
  }

  // One key signs both kinds, so `typ` is the only thing that tells them apart: an access token says `at+jwt`
  // (ADR 0011 (a)), and an ID token says `JWT` or nothing at all (RFC 7519 §5.1 makes the header optional).
  if (header.typ !== undefined && header.typ !== 'JWT') {
    throw new InvalidIdTokenError('wrong_typ', `An ID token says \`typ: JWT\` or nothing; this one says ${JSON.stringify(header.typ)}.`)
  }

  // The algorithm comes from the document, never from the token's own choice: this is what refuses `none`.
  const document = await cache.discovery(issuer, client)
  const algorithms = document.id_token_signing_alg_values_supported
  if (header.alg === undefined || !algorithms.includes(header.alg)) {
    throw new InvalidIdTokenError('alg_not_allowed', `${issuer} does not publish the algorithm ${JSON.stringify(header.alg)}.`)
  }

  if (header.kid === undefined) {
    throw new InvalidIdTokenError('unknown_kid', 'The token names no `kid`, so no published key can be matched to it.')
  }
  const published = await publishedKey(header.kid, issuer, document.jwks_uri, client, cache)
  if (published === undefined) {
    throw new InvalidIdTokenError('unknown_kid', `${issuer} publishes no key with the kid ${JSON.stringify(header.kid)}.`)
  }

  let key
  try {
    key = await importJWK(published, header.alg)
  } catch (cause) {
    // As in `verifyAccessToken`: the cache already refused a set whose keys do not import for the `alg` they name, so
    // what is left is a key the document lets this token name it for. Either way it is the metadata failing.
    throw new DiscoveryError('unusable_key', `The key ${JSON.stringify(header.kid)} that ${issuer} publishes cannot verify ${header.alg}.`, { cause })
  }

  let payload: JWTPayload
  try {
    // `requiredClaims` makes the three mandatory: jose otherwise validates `exp` only when the token carries it.
    const verified = await jwtVerify(idToken, key, {
      algorithms,
      issuer,
      audience: clientId,
      requiredClaims: ['exp', 'iat', 'sub'],
      clockTolerance: 0,
    })
    payload = verified.payload
  } catch (cause) {
    throw refusal(cause)
  }

  // Only where one was sent: a refreshed ID token answers no authorization request and carries none (§7).
  if (nonce !== undefined && payload.nonce !== nonce) {
    throw new InvalidIdTokenError('nonce_mismatch', 'The token does not carry the `nonce` of the authorization request it answers.')
  }

  return claimsOf(payload)
}

/** What an application shows of the account, from the claims it was just handed. */
export const profileOf = (claims: IdTokenClaims): ProfileSnapshot => ({
  sub: claims.sub,
  accountType: claims.account_type,
  displayName: claims.name ?? null,
  // CAS releases no `picture` today; mapping the standard claim now means nothing here changes when it does.
  avatarUrl: claims.picture ?? null,
})
