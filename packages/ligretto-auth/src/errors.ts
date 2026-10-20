/**
 * The typed refusals of this package. Every one carries a stable `code`, so a caller branches on the code and a
 * handler maps it to a status of its own instead of letting an unhandled failure become a 500.
 */

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
