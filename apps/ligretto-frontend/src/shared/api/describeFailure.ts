import type {
  ErrorResult,
  GetMeResponses,
  ListUsersResponses,
  RedirectResult,
  TransportFailure,
  UnexpectedResult,
} from '@memebattle/ligretto-core-client'

/**
 * Any result but `success` of the operations the frontend calls, as the client declares it. Each operation's
 * `ErrorResult` is taken on its own: `keyof` of a union of response maps keeps only the statuses they share.
 */
export type FailedResult = ErrorResult<GetMeResponses> | ErrorResult<ListUsersResponses> | RedirectResult | UnexpectedResult | TransportFailure

/**
 * What a failed call is logged with: its kind, its status and the stable error code. Never a body, which may carry a
 * token or a profile.
 */
export const describeFailure = (result: FailedResult) => ({
  kind: result.kind,
  status: result.kind === 'transport' ? undefined : result.status,
  error: result.kind === 'error' ? result.error.error : undefined,
})
