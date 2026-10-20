/**
 * The transport of the CAS OIDC endpoints: every generated function in `./generated/operations` calls a `Client`,
 * and nothing else in this package calls `fetch`.
 *
 * A call has two ways to fail. An error CAS answered with — a 4xx or a 5xx whose body carries a code, either the
 * OAuth2 `{ "error", "error_description" }` or the envelope `{ "error": { "code", "message" } }` — is part of the
 * contract: it comes back as a value, a `Result` whose `error.code` is typed as the codes the operation declares.
 * Only what is outside the contract is thrown: `fetch` rejecting (the network), an error response whose body carries
 * no code (a proxy's page, not CAS: `ApiError` with the code `unknown`), a 2xx whose body is not JSON, and any
 * redirect.
 *
 * Unlike a browser client there is no ambient origin here: a `Client` is made with `createClient({ baseUrl })` and
 * every request resolves against that base, or against the absolute URL `atUrl` puts in its place — which is how a
 * generated operation is sent to an endpoint the discovery document advertises rather than to the path the
 * description embeds.
 */

const UNKNOWN_ERROR_CODE = 'unknown'

/** The code of any 3xx: the client follows no redirect, so the caller decides what a navigation endpoint answered. */
const REDIRECT_REFUSED_CODE = 'redirect_refused'

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
 * A response outside the contract the callers handle: a redirect, an error response whose body carries no code
 * (`unknown`), or a 2xx whose body is not JSON (`unknown`).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** The response's headers: a refused redirect names its `Location`. */
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
 * value — a caller cannot ask for a throw that would never happen.
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type Options<TOptions, ThrowOnError extends boolean = false> = Omit<TOptions, 'headers'> & {
  headers?: Record<string, string> & DeclaredHeaders<TOptions>
  client?: Client
  throwOnError?: never
}

/**
 * What a generated function resolves to: the success body or an error CAS answered with. `ThrowOnError` is kubb's and
 * is ignored (see `Options`).
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type RequestResult<Responses, ThrowOnError extends boolean = false> = Result<SuccessOf<Responses>, ErrorCodeOf<Responses>>

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

const readBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

const asMessage = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback)

/** An error response as the failure CAS answered with, or the `ApiError` to throw when its body carries no code. */
const toFailure = async (response: Response): Promise<{ ok: false; error: ApiFailure } | ApiError> => {
  const body = await readBody(response)
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

/** The body as it goes on the wire, and the content type it needs when the caller named none. */
const encodeBody = (body: unknown, declared: string | undefined): { body: string; contentType: string } | undefined => {
  if (body === undefined) {
    return undefined
  }
  // `/oidc/token` and the end-session form take an already-encoded form body: send the string verbatim, never quoted
  // into JSON.
  if (typeof body === 'string') {
    return { body, contentType: declared ?? 'application/x-www-form-urlencoded' }
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
}

/** A client that sends every request to `baseUrl`, following no redirect. */
export const createClient =
  ({ baseUrl, fetch: fetchImpl }: ClientOptions): Client =>
  async ({ method, url, body, contentType, headers }) => {
    const send = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init))
    const encoded = encodeBody(body, contentType?.request)
    const response = await send(urlOf(url, baseUrl), {
      method,
      redirect: 'manual',
      headers: headersOf(encoded?.contentType, headers),
      body: encoded?.body,
    })

    // The caller decides what a navigation endpoint's redirect means; `redirect: 'manual'` reports it as an opaque
    // response in a browser-like runtime and as the 3xx itself elsewhere.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new ApiError(response.status, REDIRECT_REFUSED_CODE, `${method} ${url} answered a redirect, which this client does not follow`, {
        headers: response.headers,
      })
    }

    if (!response.ok) {
      const failure = await toFailure(response)
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
    const data = await readBody(response)
    if (data === undefined) {
      throw new ApiError(response.status, UNKNOWN_ERROR_CODE, `${method} ${url} answered ${response.status} with a body that is not JSON`, {
        headers: response.headers,
      })
    }

    return { ok: true, status: response.status, headers: response.headers, data }
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
