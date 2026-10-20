/**
 * `@memebattle/ligretto-auth`: the server side of talking to CAS.
 *
 * Server-only and runtime-agnostic — `fetch`, WebCrypto and `Request`/`Response`, no framework and no Node API — so
 * the same source runs on Cloudflare Workers and on Node. See the README.
 */

export { verifyAccessToken } from './verify-access-token'
export type { AccessTokenClaims, VerifyAccessTokenOptions } from './verify-access-token'

export { createCasClient } from './cas-client'
export type {
  AuthorizationRequest,
  AuthorizationRequestOptions,
  CasClient,
  CasClientOptions,
  EndSessionUrlOptions,
  ExchangeCodeOptions,
  Tokens,
} from './cas-client'

export { profileOf, validateIdToken } from './id-token'
export type { IdTokenClaims, ProfileSnapshot, ValidateIdTokenOptions } from './id-token'

export { createInMemorySessionStore } from './session-store'
export type { InMemorySessionStoreOptions, PendingAuthorizationRequest, Session, SessionStore } from './session-store'

export {
  beginSignIn,
  CallbackStateError,
  completeSignIn,
  GRANT_LIFETIME_MS,
  mintGuest,
  PENDING_REQUEST_TTL_MS,
  refreshSession,
  UnknownSessionError,
} from './sessions'
export type {
  BeginSignInOptions,
  BeginSignInResult,
  CompleteSignInOptions,
  CompleteSignInResult,
  RefreshSessionOptions,
  SessionContext,
} from './sessions'

export { DiscoveryError, InvalidIdTokenError, InvalidTokenError, TokenEndpointError } from './errors'
export type { DiscoveryErrorCode, IdTokenErrorCode, InvalidTokenCode, TokenEndpointErrorCode, TokenEndpointErrorOptions } from './errors'

export { createDiscoveryCache } from './discovery'
export type { DiscoveryCache, DiscoveryCacheOptions } from './discovery'

export { ApiError, atUrl, createClient } from './client'
export type { ApiErrorOptions, ApiFailure, Client, ClientOptions, Options, RequestConfig, RequestResult, Result } from './client'

export { errorCodes } from './generated/error-codes'
export type { OidcErrorCode } from './generated/error-codes'

export type { AccountType } from './generated/models/AccountType'
export type { Discovery } from './generated/models/Discovery'
export type { Jwks } from './generated/models/Jwks'
export type { PublicJwk } from './generated/models/PublicJwk'
export type { TokenResponse } from './generated/models/TokenResponse'
export type { UserInfoClaims } from './generated/models/UserInfoClaims'
