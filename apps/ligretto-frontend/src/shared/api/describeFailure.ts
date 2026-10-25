/** Any result of a generated operation but `success`. */
type FailedResult =
  | { kind: 'error'; status: number; error: { error: string } }
  | { kind: 'redirect' | 'unexpected'; status: number }
  | { kind: 'transport' }

/**
 * What a failed call is logged with: its kind, its status and the stable error code. Never a body, which may carry a
 * token or a profile.
 */
export const describeFailure = (result: FailedResult) => ({
  kind: result.kind,
  status: 'status' in result ? result.status : undefined,
  error: result.kind === 'error' ? result.error.error : undefined,
})
