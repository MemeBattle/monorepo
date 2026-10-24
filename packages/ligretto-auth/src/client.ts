/**
 * The transport of the CAS OIDC endpoints: every generated function in `./generated/operations` calls a `Client`,
 * and nothing else in this package calls `fetch`.
 *
 * A call has two ways to fail. An error CAS answered with — a 4xx or a 5xx whose body carries a code, either the
 * OAuth2 `{ "error", "error_description" }` or the envelope `{ "error": { "code", "message" } }` — is part of the
 * contract: it comes back as a value, a `Result` whose `error.code` is typed as the codes the operation declares.
 * Everything outside the contract is thrown, and always as an `ApiError`: `fetch` rejecting, so no response came back
 * at all (`unreachable`), an error response whose body carries no code (a proxy's page, not CAS: `unknown`), a 2xx
 * whose body is not JSON, and any redirect. One class for all of them because they are one thing to a caller: the
 * provider cannot be used right now.
 *
 * Unlike a browser client there is no ambient origin here: a `Client` is made with `createClient({ baseUrl })` and
 * every request resolves against that base, or against the absolute URL `atUrl` puts in its place — which is how a
 * generated operation is sent to an endpoint the discovery document advertises rather than to the path the
 * description embeds.
 */

const UNKNOWN_ERROR_CODE = 'unknown'

/** The code of any 3xx: the client follows no redirect, so the caller decides what a navigation endpoint answered. */
const REDIRECT_REFUSED_CODE = 'redirect_refused'

/**
 * The code of a request that produced no usable response: no response at all — DNS, TLS, a refused connection — or
 * a response whose body never arrived within the request timeout.
 */
const UNREACHABLE_CODE = 'unreachable'

/** The status of an `ApiError` that has no usable response behind it: nothing answered in full, so nothing has a status. */
const NO_RESPONSE_STATUS = 0

/**
 * The longest request timeout accepted: timers are 32-bit signed milliseconds on every runtime, and Node turns a
 * larger value into 1 ms with a warning. `0` is excluded on purpose (it aborts before the request is sent), and a
 * fraction is excluded because `AbortSignal.timeout` throws on one.
 */
const MAX_TIMEOUT_MS = 2_147_483_647

/** An error CAS answered with: the status and the error code the operation lists for it. */
export interface ApiFailure<Code extends string = string> {
  status: number
  code: Code
  /** The server's `error_description`. For the developer; callers branch on `code`. */
  message: string
  /**
   * The response's headers: a refusal can carry what to do next, as `429 rate_limit_exceeded` carries the delay to
   * wait out in `Retry-After` ([INTEGRATION.md §8](../../../apps/cas/docs/INTEGRATION.md)).
   */
  headers: Headers
}

/** What a call resolves to: the success body with the response's status and headers, or an error CAS answered with. */
export type Result<Data, Code extends string = string> =
  | { ok: true; status: number; headers: Headers; data: Data }
  | { ok: false; error: ApiFailure<Code> }

export interface ApiErrorOptions extends ErrorOptions {
  headers?: Headers
}

/**
 * A call that gave the caller nothing it can use: a response outside the contract — a redirect, an error response
 * whose body carries no code (`unknown`), a 2xx whose body is not JSON (`unknown`) — or no response at all, because
 * `fetch` itself rejected (`unreachable`).
 *
 * The network belongs here rather than escaping as whatever `fetch` threw: a caller mapping known failures to
 * statuses of its own has no type to recognise a bare `TypeError` by, and would answer a routine outage with an
 * unhandled 500.
 */
export class ApiError extends Error {
  /** The response's status, or `0` when the request produced no usable response. */
  readonly status: number
  readonly code: string
  /** The response's headers: a refused redirect names its `Location`. Empty when nothing answered. */
  readonly headers: Headers

  constructor(status: number, code: string, message: string, options: ApiErrorOptions = {}) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.headers = options.headers ?? new Headers()
  }
}

/**
 * The code an error body carries: the OAuth2 `error`, or the envelope's `error.code`. Distributive, so a status that
 * answers either shape (a `500` is `server_error` or `internal_error`) yields both codes, and a status kubb describes
 * per content type (`{ contentType, data }`) yields the codes of its JSON variant; an HTML page carries none.
 */
type CodeOfBody<Body> = Body extends { error: infer Code extends string }
  ? Code
  : Body extends { error: { code: infer Code extends string } }
    ? Code
    : Body extends { data: infer Data }
      ? CodeOfBody<Data>
      : never

/** The codes of the 4xx and 5xx responses an operation declares: the failures that come back as a value. */
export type ErrorCodeOf<Responses> = {
  [Status in keyof Responses]: Status extends `4${string}` | `5${string}` ? CodeOfBody<Responses[Status]> : never
}[keyof Responses]

/** The body of a successful call: the 2xx responses, with a 204 as the `undefined` the client returns for it. */
export type SuccessOf<Responses> = {
  [Status in keyof Responses]: Status extends '204' ? undefined : Status extends `2${string}` ? Responses[Status] : never
}[keyof Responses]

/** What a generated function passes to a `Client`. */
export interface RequestConfig {
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** A path of the description, resolved against the base URL, or an absolute URL (what `atUrl` puts here). */
  url: string
  body?: unknown
  /** The request content type the operation declares; `/oidc/token` and the end-session form have one. */
  contentType?: { request?: string; response?: string }
  /** The headers of the request: the token endpoint's `Authorization: Basic`, userinfo's `Authorization: Bearer`. */
  headers?: Record<string, string>
  /** No mirrored operation declares a path or query parameter; accepted because the generated call passes them. */
  path?: unknown
  query?: unknown
  /** The security schemes the operation declares; the caller sends the credential as a header itself. */
  security?: readonly unknown[]
  /**
   * Always `false` (`throwOnErrorDefault` in `kubb.config.ts`) and not read: an error CAS answered with always comes
   * back as a value, anything outside the contract is always thrown.
   */
  throwOnError?: false
}

export type Client = (config: RequestConfig) => Promise<Result<unknown>>

/**
 * The `headers` the generated options type declares. Kubb derives the field from the operation's declared header
 * parameters and emits `headers?: never` when it has none — which is every mirrored operation, since CAS describes
 * `Authorization` through security schemes. `unknown` for that case, so the intersection below is a no-op; a real
 * declared type survives it, and a spec that grows a header parameter is not silently loosened.
 */
type DeclaredHeaders<TOptions> = TOptions extends { headers?: infer Declared }
  ? [Exclude<Declared, undefined>] extends [never]
    ? unknown
    : Exclude<Declared, undefined>
  : unknown

/**
 * The options of a generated function: the operation's own, plus the client to call instead of the default one.
 *
 * `headers` is replaced rather than intersected: `never & Record<string, string>` admits nothing, so intersecting
 * would leave `token({ headers: { Authorization } })` un-typeable even though the generated function already spreads
 * the field into the request config.
 *
 * `ThrowOnError` is kubb's: plugin-client prints the generic and the `throwOnError` option into every operation and
 * offers no option to leave them out, only their default. This transport has one policy, so the option admits no
 * value — a caller cannot ask for a throw that would never happen. The leading underscore keeps a consumer
 * type-checking this source under `noUnusedParameters` from failing on the unused generic; the generated callers
 * pass it positionally and are unaffected.
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type Options<TOptions, _ThrowOnError extends boolean = false> = Omit<TOptions, 'headers'> & {
  headers?: Record<string, string> & DeclaredHeaders<TOptions>
  client?: Client
  throwOnError?: never
}

/**
 * What a generated function resolves to: the success body or an error CAS answered with. `ThrowOnError` is kubb's,
 * ignored and underscored for the reasons `Options` gives.
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type RequestResult<Responses, _ThrowOnError extends boolean = false> = Result<SuccessOf<Responses>, ErrorCodeOf<Responses>>

/** The OAuth2 error body of a failed OIDC call (RFC 6749 §5.2), which every JSON failure of these endpoints uses. */
interface OAuthErrorBody {
  error: string
  error_description?: unknown
}

/** The envelope the JSON API uses, which the mirrored paths answer with for an internal error (`internal_error`). */
interface EnvelopeErrorBody {
  error: { code: string; message?: unknown }
}

const asObject = (body: unknown): Record<string, unknown> | undefined =>
  typeof body === 'object' && body !== null && 'error' in body ? (body as Record<string, unknown>) : undefined

const isOAuthErrorBody = (body: unknown): body is OAuthErrorBody => typeof asObject(body)?.error === 'string'

const isEnvelopeErrorBody = (body: unknown): body is EnvelopeErrorBody => {
  const error = asObject(body)?.error
  return typeof error === 'object' && error !== null && typeof (error as EnvelopeErrorBody['error']).code === 'string'
}

/** Bounds one step of a request by its deadline: the work, or the timeout's `ApiError` once the deadline fires. */
type Bounded = <T>(work: Promise<T>) => Promise<T>

/** A request without a deadline: every step is the work itself. */
const unbounded: Bounded = async work => await work

/**
 * The body as JSON, or `undefined` when it is not JSON. A deadline that fires while the body is read throws the
 * timeout's `ApiError` instead, whether the `bounded` race rejected or a real `fetch` errored the body stream with the
 * signal's reason: a stalled body is an outage, not a body that is not JSON.
 */
const readBody = async (response: Response, bounded: Bounded, timedOut: (cause: unknown) => ApiError | undefined): Promise<unknown> => {
  try {
    return await bounded(response.json())
  } catch (cause) {
    const timeout = cause instanceof ApiError ? cause : timedOut(cause)
    if (timeout !== undefined) {
      // Best effort: a body nobody will read any more must not keep a real connection open. A real `fetch` has
      // already errored the stream with the signal's reason; a stream still locked by the pending read refuses.
      response.body?.cancel(timeout.cause).catch(() => undefined)
      throw timeout
    }
    return undefined
  }
}

const asMessage = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback)

/** An error response as the failure CAS answered with, or the `ApiError` to throw when its body carries no code. */
const toFailure = async (
  response: Response,
  bounded: Bounded,
  timedOut: (cause: unknown) => ApiError | undefined,
): Promise<{ ok: false; error: ApiFailure } | ApiError> => {
  const body = await readBody(response, bounded, timedOut)
  const fallback = response.statusText || 'Request failed'
  const declared = isOAuthErrorBody(body)
    ? { code: body.error, message: asMessage(body.error_description, fallback) }
    : isEnvelopeErrorBody(body)
      ? { code: body.error.code, message: asMessage(body.error.message, fallback) }
      : undefined

  if (declared === undefined) {
    return new ApiError(response.status, UNKNOWN_ERROR_CODE, fallback, { headers: response.headers })
  }
  return { ok: false, error: { status: response.status, ...declared, headers: response.headers } }
}

/** The content type of the two form-bodied operations CAS describes, `/oidc/token` and the end-session form. */
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'

/**
 * A form body as it goes on the wire, the object's entries in their order. An `undefined` value is left out, so an
 * optional parameter the caller omitted is absent from the form rather than the string `undefined`. Every value is a
 * string — the description's grant schemas carry nothing else (cas ADR 0023 (e)).
 */
const formBody = (body: object): string =>
  new URLSearchParams(Object.entries(body).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString()

/** The body as it goes on the wire, and the content type it needs when the caller named none. */
const encodeBody = (body: unknown, declared: string | undefined): { body: string; contentType: string } | undefined => {
  if (body === undefined) {
    return undefined
  }
  // The end-session form is described as an already-encoded body: send the string verbatim, never quoted into JSON.
  if (typeof body === 'string') {
    return { body, contentType: declared ?? FORM_CONTENT_TYPE }
  }
  // `/oidc/token` describes one schema per grant (cas ADR 0023), so a grant arrives here as an object and goes on the
  // wire as the form the operation declares.
  if (declared === FORM_CONTENT_TYPE && typeof body === 'object' && body !== null) {
    return { body: formBody(body), contentType: declared }
  }
  return { body: JSON.stringify(body), contentType: declared ?? 'application/json' }
}

/** Whether the request config carries a URL of its own — what `atUrl` puts there — rather than a path to resolve. */
const isAbsolute = (url: string): boolean => /^[a-z][a-z\d+\-.]*:/i.test(url)

/**
 * Where a request goes. A path of the description is **appended** to the base URL, not resolved against it:
 * `new URL('/oidc/token', 'https://cas.example/path')` is `https://cas.example/oidc/token`, which drops the path an
 * issuer is allowed to carry — CAS advertises every endpoint as `{issuer}/<path>` and forbids a trailing slash.
 */
const urlOf = (url: string, baseUrl: string): URL =>
  isAbsolute(url) ? new URL(url) : new URL(`${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`)

/**
 * The headers of the request: the content type the body encoding needs, overridden by every header the caller named.
 * `Headers.set` normalises the name, so a caller's `content-type` replaces the computed `Content-Type` instead of
 * being joined to it into a value no content-type check accepts.
 */
const headersOf = (contentType: string | undefined, headers: Record<string, string> | undefined): Headers => {
  const merged = new Headers(contentType === undefined ? undefined : { 'Content-Type': contentType })
  for (const [name, value] of Object.entries(headers ?? {})) {
    merged.set(name, value)
  }
  return merged
}

export interface ClientOptions {
  /** The CAS issuer, or any origin the description's paths hang off; `atUrl` overrides it per call. */
  baseUrl: string
  /** The `fetch` to send with, for a runtime that does not have a global one and for tests. */
  fetch?: typeof globalThis.fetch
  /**
   * Bounds one request from the call to `fetch` to the end of its body. An integer from 1 to 2147483647
   * milliseconds, the range `AbortSignal.timeout` supports on every runtime; no bound when left out. A request that
   * outlives it fails as an `ApiError` `unreachable`, its `cause` the `TimeoutError`.
   */
  requestTimeoutMs?: number
}

/** The timeout as given, refused at construction when no runtime can honour it as it stands. */
const requestTimeoutOf = (value: unknown): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new TypeError(`The request timeout must be an integer from 1 to ${MAX_TIMEOUT_MS} milliseconds; got ${String(value)}.`)
  }
  return value
}

/** A client that sends every request to `baseUrl`, following no redirect. */
export const createClient = ({ baseUrl, fetch: fetchImpl, requestTimeoutMs: requested }: ClientOptions): Client => {
  // Validated once, here, so that no accepted configuration can throw on the request path or silently become 1 ms.
  const requestTimeoutMs = requestTimeoutOf(requested)

  return async ({ method, url, body, contentType, headers }) => {
    // Typed from `globalThis.fetch` itself rather than from `RequestInfo`, which only `lib.dom` declares: a Node
    // consumer type-checks this source and must not have to load the browser globals to do it.
    const send = fetchImpl ?? ((...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args))
    const encoded = encodeBody(body, contentType?.request)

    // One deadline for the whole request: the headers and the body alike, so a caller holding a lock across this call
    // waits no longer than the bound whichever phase the provider stalls in.
    const deadline = requestTimeoutMs === undefined ? undefined : AbortSignal.timeout(requestTimeoutMs)
    const timeoutError = (cause: unknown): ApiError =>
      new ApiError(NO_RESPONSE_STATUS, UNREACHABLE_CODE, `${method} ${url} did not answer within ${requestTimeoutMs} ms`, { cause })
    /** The timeout's `ApiError` when the deadline is what failed the step, `undefined` for any other failure. */
    const timedOut = (cause: unknown): ApiError | undefined => (deadline?.aborted === true ? timeoutError(cause) : undefined)
    const bounded: Bounded =
      deadline === undefined
        ? unbounded
        : async work => {
            let onAbort = (): void => undefined
            const expired = new Promise<never>((_, reject) => {
              onAbort = () => reject(timeoutError(deadline.reason))
              if (deadline.aborted) {
                onAbort()
              } else {
                deadline.addEventListener('abort', onAbort, { once: true })
              }
            })
            try {
              return await Promise.race([work, expired])
            } finally {
              // A deadline that fires after the work settled must reject nothing: `expired` is never awaited again.
              deadline.removeEventListener('abort', onAbort)
            }
          }

    let response: Response
    try {
      response = await bounded(
        send(urlOf(url, baseUrl), {
          method,
          redirect: 'manual',
          headers: headersOf(encoded?.contentType, headers),
          body: encoded?.body,
          ...(deadline === undefined ? {} : { signal: deadline }),
        }),
      )
    } catch (cause) {
      if (cause instanceof ApiError) {
        throw cause
      }
      // Typed here, at the one place this package touches the network, so every call through it fails the same way:
      // a caller cannot be expected to recognise `fetch`'s own rejection, which is a bare `TypeError`. A `fetch` given
      // the deadline rejects with its reason once it fires; the `aborted` flag is the test, not the error's name.
      throw (
        timedOut(cause) ??
        new ApiError(NO_RESPONSE_STATUS, UNREACHABLE_CODE, `${method} ${url} could not be sent: the provider could not be reached`, {
          cause,
        })
      )
    }

    // The caller decides what a navigation endpoint's redirect means; `redirect: 'manual'` reports it as an opaque
    // response in a browser-like runtime and as the 3xx itself elsewhere. Read as a plain string: the Workers runtime
    // types, which a service on Workers compiles this source against, have no `opaqueredirect`.
    const responseType: string = response.type
    if (responseType === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new ApiError(response.status, REDIRECT_REFUSED_CODE, `${method} ${url} answered a redirect, which this client does not follow`, {
        headers: response.headers,
      })
    }

    if (!response.ok) {
      const failure = await toFailure(response, bounded, timedOut)
      if (failure instanceof ApiError) {
        throw failure
      }
      return failure
    }

    if (response.status === 204) {
      return { ok: true, status: response.status, headers: response.headers, data: undefined }
    }

    // A success is only a success once its body can be read: an interstitial that answers 200 with a page is not the
    // contract, and a caller that branches on `ApiError` must see it as one rather than as a raw `SyntaxError`.
    const data = await readBody(response, bounded, timedOut)
    if (data === undefined) {
      throw new ApiError(response.status, UNKNOWN_ERROR_CODE, `${method} ${url} answered ${response.status} with a body that is not JSON`, {
        headers: response.headers,
      })
    }

    return { ok: true, status: response.status, headers: response.headers, data }
  }
}

/**
 * `client` with the request's URL replaced by an absolute one. It is how a generated operation reaches the endpoint
 * the discovery document advertises — `jwks_uri`, or the discovery document of a path-bearing issuer — without
 * editing generated code, which embeds the path of the description.
 */
export const atUrl =
  (client: Client, url: string): Client =>
  config =>
    client({ ...config, url })

/**
 * The client the generated operations import when the caller passes none. The package has no ambient base URL — a
 * server talks to a named CAS — so this is a guard rather than a default.
 */
export const client: Client = () => {
  throw new Error('@memebattle/ligretto-auth has no default CAS: make a client with createClient({ baseUrl }) and pass it as the `client` option.')
}
