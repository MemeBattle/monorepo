/**
 * `@memebattle/ligretto-auth`: the server side of talking to CAS.
 *
 * Server-only and runtime-agnostic — `fetch`, WebCrypto and `Request`/`Response`, no framework and no Node API — so
 * the same source runs on Cloudflare Workers and on Node. See the README.
 */

export { verifyAccessToken } from './verify-access-token'
export type { AccessTokenClaims, VerifyAccessTokenOptions } from './verify-access-token'

export { DiscoveryError, InvalidTokenError } from './errors'
export type { DiscoveryErrorCode, InvalidTokenCode } from './errors'

export { createDiscoveryCache } from './discovery'
export type { DiscoveryCache, DiscoveryCacheOptions } from './discovery'

export { ApiError, atUrl, createClient } from './client'
export type { ApiFailure, Client, ClientOptions, Options, RequestConfig, RequestResult, Result } from './client'

export { errorCodes } from './generated/error-codes'
export type { OidcErrorCode } from './generated/error-codes'

export type { AccountType } from './generated/models/AccountType'
export type { Discovery } from './generated/models/Discovery'
export type { Jwks } from './generated/models/Jwks'
export type { PublicJwk } from './generated/models/PublicJwk'
export type { TokenResponse } from './generated/models/TokenResponse'
export type { UserInfoClaims } from './generated/models/UserInfoClaims'
