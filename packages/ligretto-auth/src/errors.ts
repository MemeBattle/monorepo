/**
 * The typed refusals of this package. Every one carries a stable `code`, so a caller branches on the code and a
 * handler maps it to a status of its own instead of letting an unhandled failure become a 500.
 */

import type { ErrorCodeOf } from './client'
import type { TokenResponses } from './generated/models/Token'

/**
 * Why an access token was refused: one code per check of
 * [INTEGRATION.md §6](../../../apps/cas/docs/INTEGRATION.md), in the order the checks run.
 */
export type InvalidTokenCode =
  /** Not a JWS with a decodable protected header, or a payload that is not an access token's claim set. */
  | 'malformed'
  /** `typ` is not `at+jwt`: an ID token says `JWT`, and one key signs both (ADR 0011 (a)). */
  | 'wrong_typ'
  /** `alg` is not one the discovery document lists, which refuses `none` and every algorithm but ES256. */
  | 'alg_not_allowed'
  /** No published key has the token's `kid`, after the one refetch a fresh key deserves. */
  | 'unknown_kid'
  /** The signature does not match the published key. */
  | 'invalid_signature'
  /** `iss` is not the configured issuer. */
  | 'wrong_issuer'
  /** `aud` is not this resource server's audience: the token was minted for another one. */
  | 'wrong_audience'
  /** `exp` is absent or not a number; the claim is required (RFC 9068 §2.2). */
  | 'invalid_exp'
  /** `exp` is not in the future; `exp` equal to now is expired. */
  | 'expired'

/** An access token this resource server will not accept. */
export class InvalidTokenError extends Error {
  readonly code: InvalidTokenCode

  constructor(code: InvalidTokenCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidTokenError'
    this.code = code
  }
}

/**
 * Why an ID token was refused: one code per check of
 * [INTEGRATION.md §5](../../../apps/cas/docs/INTEGRATION.md), in the order the checks run.
 *
 * A class of its own rather than `InvalidTokenCode`: the audiences differ — an ID token is minted for the client id,
 * an access token for the resource server (ADR 0011 (b)) — and a caller must tell a refused sign-in from a refused
 * bearer token.
 */
export type IdTokenErrorCode =
  /** Not a JWS with a decodable protected header. */
  | 'malformed'
  /** `typ` is present and is not `JWT`: `at+jwt` is an access token in the `id_token` slot (ADR 0011 (a)). */
  | 'wrong_typ'
  /** `alg` is not one the discovery document lists, which refuses `none` and every algorithm but ES256. */
  | 'alg_not_allowed'
  /** No published key has the token's `kid`, after the one refetch a fresh key deserves. */
  | 'unknown_kid'
  /** The signature does not match the published key. */
  | 'invalid_signature'
  /** `iss` is not the configured issuer. */
  | 'wrong_issuer'
  /** `aud` is not this client's id: the token was minted for another client. */
  | 'wrong_audience'
  /** `exp` is absent or not a number; the claim is required. */
  | 'invalid_exp'
  /** `exp` is not in the future; `exp` equal to now is expired. */
  | 'expired'
  /** A `nonce` was expected and the token carries another one, or none. */
  | 'nonce_mismatch'
  /** The payload is not an ID token claim set: a claim this package reads is missing or has the wrong type. */
  | 'missing_claims'

/** An ID token this client will not accept, so nothing in it is trusted. */
export class InvalidIdTokenError extends Error {
  readonly code: IdTokenErrorCode

  constructor(code: IdTokenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidIdTokenError'
    this.code = code
  }
}

/**
 * Why CAS refused a token request: the codes the description declares for the failures of `/oidc/token`, so the union
 * follows the description rather than a copy of it
 * ([INTEGRATION.md §12](../../../apps/cas/docs/INTEGRATION.md), ADR 0016 (i)).
 */
export type TokenEndpointErrorCode = ErrorCodeOf<TokenResponses>

export interface TokenEndpointErrorOptions extends ErrorOptions {
  headers?: Headers
}

/** `Retry-After` in seconds. Only the delta-seconds form is read: CAS sends `Retry-After: 60` (§8). */
const retryAfterOf = (headers: Headers): number | undefined => {
  const value = headers.get('retry-after')?.trim()
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined
}

/**
 * A refusal the token endpoint answered with. Thrown rather than returned: the transport's errors-as-values rule is
 * the transport's, and a caller of the confidential client branches on `code` to decide what to do next — mint a new
 * guest on `invalid_grant`, wait out `retryAfterSeconds` on `rate_limit_exceeded`, try again on a `503`.
 */
export class TokenEndpointError extends Error {
  readonly code: TokenEndpointErrorCode
  readonly status: number
  /** The response's headers, so a caller reads what a refusal prescribes beyond its code. */
  readonly headers: Headers
  /** The delay `Retry-After` prescribes, when the refusal carries one. */
  readonly retryAfterSeconds: number | undefined

  constructor(code: TokenEndpointErrorCode, status: number, message: string, options: TokenEndpointErrorOptions = {}) {
    super(message, options)
    this.name = 'TokenEndpointError'
    this.code = code
    this.status = status
    this.headers = options.headers ?? new Headers()
    this.retryAfterSeconds = retryAfterOf(this.headers)
  }
}

/** Why the provider's metadata could not be used. Not a token refusal: the token was never judged. */
export type DiscoveryErrorCode =
  /** The discovery document or the JWKS could not be fetched, or answered a failure. */
  | 'discovery_unavailable'
  /** The document's `issuer` is not byte-identical to the configured issuer (ADR 0009 (e)). */
  | 'issuer_mismatch'
  /** The document or the JWKS parsed but says nothing a verification can be run from. */
  | 'malformed_metadata'
  /** The published key the token names cannot be imported for the algorithm the document publishes. */
  | 'unusable_key'

/** The provider's metadata could not be obtained or could not be trusted. */
export class DiscoveryError extends Error {
  readonly code: DiscoveryErrorCode

  constructor(code: DiscoveryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DiscoveryError'
    this.code = code
  }
}
