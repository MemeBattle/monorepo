/**
 * The transport of the CAS API: every generated function in `./generated/operations` calls `client()`, and nothing
 * else in the app calls `fetch`. A later interceptor (logging, retries) belongs here too.
 *
 * The SPA and the API share one origin in production, so paths are relative
 * (`/api/...`) and there is no base URL and no `credentials` option: the session
 * cookie is same-origin and rides along on its own. In development vite proxies
 * `/api` to the CAS dev server, which keeps the origin the same there too.
 */

const UNKNOWN_ERROR_CODE = 'unknown'

/**
 * A CAS error response: `{ "error": { "code", "message" } }`. 401 is always `unauthenticated`. `Code` narrows `code` to
 * what an operation declares (see `isApiError`).
 */
export class ApiError<Code extends string = string> extends Error {
  readonly status: number
  readonly code: Code

  constructor(status: number, code: Code, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Whether `error` is an `ApiError`. The type argument is the caller's statement of which operation threw: the code
 * union its entity exports (`AddPasskeyErrorCode`, ...), so a comparison with a code that operation never answers
 * does not compile. `unknown` is always possible, since any call can end with a body that cannot be read.
 */
export const isApiError = <Code extends string = string>(error: unknown): error is ApiError<Code | typeof UNKNOWN_ERROR_CODE> =>
  error instanceof ApiError

/** The codes of every error response an operation declares; success bodies contribute nothing. */
export type ErrorCodeOf<Responses> = {
  [Status in keyof Responses]: Responses[Status] extends { error: { code: infer Code extends string } } ? Code : never
}[keyof Responses]

/** The body a successful call resolves to: the 2xx responses, with a 204 as the `undefined` `client()` returns for it. */
export type SuccessOf<Responses> = {
  [Status in keyof Responses]: Status extends '204' ? undefined : Status extends `2${string}` ? Responses[Status] : never
}[keyof Responses]

/** What a generated function passes to `client()`. */
export interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** A path template: `{name}` is replaced with `path.name`. */
  url: string
  path?: Record<string, string>
  body?: unknown
  /** No operation under `/api/` has query or header parameters; accepted because the generated call passes them. */
  query?: unknown
  headers?: unknown
  /** The session cookie travels on its own (same origin); accepted because the generated call passes it. */
  security?: readonly unknown[]
  /** Ignored: `client()` always throws `ApiError` on a failure. */
  throwOnError?: boolean
}

export type Client = (config: RequestConfig) => Promise<unknown>

/** The options of a generated function: the operation's own, plus the client to call instead of this one. */
export type Options<TOptions, ThrowOnError extends boolean = true> = TOptions & { client?: Client; throwOnError?: ThrowOnError }

/**
 * What a generated function resolves to: the success body. `ThrowOnError` is part of the generated signature and is
 * ignored, since `client()` always throws `ApiError` instead of resolving with a failure.
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type RequestResult<Responses, ThrowOnError extends boolean = true> = SuccessOf<Responses>

interface ErrorBody {
  error: {
    code: string
    message: string
  }
}

const isErrorBody = (body: unknown): body is ErrorBody => {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false
  }
  const { error } = body as { error: unknown }
  return typeof error === 'object' && error !== null && typeof (error as ErrorBody['error']).code === 'string'
}

const toApiError = async (response: Response): Promise<ApiError> => {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return new ApiError(response.status, UNKNOWN_ERROR_CODE, response.statusText || 'Request failed')
  }

  if (!isErrorBody(body)) {
    return new ApiError(response.status, UNKNOWN_ERROR_CODE, response.statusText || 'Request failed')
  }

  return new ApiError(response.status, body.error.code, body.error.message)
}

const toPath = (url: string, path: Record<string, string> = {}): string =>
  url.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = path[name]
    if (value === undefined) {
      throw new TypeError(`No value for the path parameter ${name} of ${url}`)
    }
    return encodeURIComponent(value)
  })

export const client: Client = async ({ method, url, path, body }) => {
  const hasBody = body !== undefined

  const response = await fetch(toPath(url, path), {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  // Logout and passkey deletion answer 204 with no body to parse.
  if (response.status === 204) {
    return undefined
  }

  return response.json()
}
