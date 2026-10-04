/**
 * The transport of the CAS API: every generated function in `./generated/operations` calls `client()`, and nothing
 * else in the app calls `fetch`. A later interceptor (logging, retries) belongs here too.
 *
 * A call has two ways to fail. A 4xx with a CAS error body is part of the contract: it comes back as a value, a
 * `Result` whose `error.code` is typed as the codes the operation declares, so a screen tells them apart without a
 * type argument nothing checks. Everything else is thrown: `fetch` rejecting (no network), a 5xx, and a body that
 * cannot be read or carries no code (`ApiError` with the code `unknown`). The models are types only, so the client
 * cannot check a 4xx code against the operation: an undeclared one still comes back as a value, which is why every
 * `switch` on a code keeps its `default`.
 *
 * The SPA and the API share one origin in production, so paths are relative
 * (`/api/...`) and there is no base URL and no `credentials` option: the session
 * cookie is same-origin and rides along on its own. In development vite proxies
 * `/api` to the CAS dev server, which keeps the origin the same there too.
 */

const UNKNOWN_ERROR_CODE = 'unknown'

/** A declared failure: the status and the CAS error body `{ "error": { "code", "message" } }`. */
export interface ApiFailure<Code extends string = string> {
  status: number
  code: Code
  message: string
}

/** What a call resolves to: the success body, or a failure the operation declares. */
export type Result<Data, Code extends string = string> = { ok: true; data: Data } | { ok: false; error: ApiFailure<Code> }

/** A successful `Result`. */
export const ok = <Data>(data: Data): { ok: true; data: Data } => ({ ok: true, data })

/** A failed `Result`. */
export const failed = <Code extends string>(status: number, code: Code, message: string): { ok: false; error: ApiFailure<Code> } => ({
  ok: false,
  error: { status, code, message },
})

/**
 * A response outside the contract the screens handle: a 5xx, or a body that cannot be read or carries no code
 * (`unknown`). Also what `unwrap` throws for a declared failure the caller does not handle.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * The data of a successful `Result`; a failure is thrown as `ApiError`. For a caller that cannot handle a declared
 * failure and leaves it to the error screen, such as a loader.
 */
export const unwrap = <Data>(result: Result<Data>): Data => {
  if (!result.ok) {
    throw new ApiError(result.error.status, result.error.code, result.error.message)
  }
  return result.data
}

/** The codes of the 4xx responses an operation declares: the failures that come back as a value. */
export type ErrorCodeOf<Responses> = {
  [Status in keyof Responses]: Status extends `4${string}`
    ? Responses[Status] extends { error: { code: infer Code extends string } }
      ? Code
      : never
    : never
}[keyof Responses]

/** The body of a successful call: the 2xx responses, with a 204 as the `undefined` `client()` returns for it. */
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
  /** Ignored: a declared failure always comes back as a value, anything else is always thrown. */
  throwOnError?: boolean
}

export type Client = (config: RequestConfig) => Promise<Result<unknown>>

/** The options of a generated function: the operation's own, plus the client to call instead of this one. */
export type Options<TOptions, ThrowOnError extends boolean = true> = TOptions & { client?: Client; throwOnError?: ThrowOnError }

/**
 * What a generated function resolves to: the success body or a declared 4xx failure. `ThrowOnError` is part of the
 * generated signature and is ignored (see `RequestConfig.throwOnError`).
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type RequestResult<Responses, ThrowOnError extends boolean = true> = Result<SuccessOf<Responses>, ErrorCodeOf<Responses>>

interface ErrorBody {
  error: {
    code: string
    message?: unknown
  }
}

const isErrorBody = (body: unknown): body is ErrorBody => {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false
  }
  const { error } = body as { error: unknown }
  return typeof error === 'object' && error !== null && typeof (error as ErrorBody['error']).code === 'string'
}

const readBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/** A failed response as a declared failure (a 4xx with a CAS body), or the `ApiError` to throw for anything else. */
const toFailure = async (response: Response): Promise<{ ok: false; error: ApiFailure } | ApiError> => {
  const body = await readBody(response)
  const fallbackMessage = response.statusText || 'Request failed'
  if (!isErrorBody(body)) {
    return new ApiError(response.status, UNKNOWN_ERROR_CODE, fallbackMessage)
  }
  const message = typeof body.error.message === 'string' ? body.error.message : fallbackMessage
  if (response.status >= 400 && response.status < 500) {
    return failed(response.status, body.error.code, message)
  }
  return new ApiError(response.status, body.error.code, message)
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
    const failure = await toFailure(response)
    if (failure instanceof ApiError) {
      throw failure
    }
    return failure
  }

  // Logout and passkey deletion answer 204 with no body to parse.
  if (response.status === 204) {
    return ok(undefined)
  }

  return ok(await response.json())
}
