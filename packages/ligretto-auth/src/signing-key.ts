/**
 * The published key a token names, shared by the two verifications this package runs: an access token on a resource
 * server (§6) and an ID token at sign-in (§5).
 *
 * An unknown `kid` is answered with one refetch of the JWKS — a rotated key is published before it signs anything
 * (ADR 0009 (d)) — and then with `undefined`, so each caller refuses with the error class its own contract names.
 */

import type { Client } from './client'
import type { DiscoveryCache } from './discovery'
import type { Jwks } from './generated/models/Jwks'
import type { PublicJwk } from './generated/models/PublicJwk'

const keyWithKid = (set: Jwks, kid: string): PublicJwk | undefined => set.keys.find(key => key.kid === kid)

/** The key `issuer` publishes under `kid`, refetching the JWKS once when the cached set does not have it. */
export const publishedKey = async (
  kid: string,
  issuer: string,
  jwksUri: string,
  client: Client,
  cache: DiscoveryCache,
): Promise<PublicJwk | undefined> => {
  const known = keyWithKid(await cache.jwks(issuer, jwksUri, client), kid)
  return known ?? keyWithKid(await cache.refetchJwks(issuer, jwksUri, client), kid)
}
