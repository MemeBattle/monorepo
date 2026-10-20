/**
 * The transport of the CAS OIDC endpoints: every generated function in `./generated/operations` calls a `Client`,
 * and nothing else in this package calls `fetch`.
 *
 * A call has two ways to fail. A 4xx with an OAuth2 error body (`{ "error", "error_description" }`, the shape every
 * JSON failure of these endpoints has) is part of the contract: it comes back as a value, a `Result` whose
 * `error.code` is typed as the codes the operation declares. Everything else is thrown: `fetch` rejecting, a 5xx, a
 * body that cannot be read or carries no code (`ApiError` with the code `unknown`), and any redirect.
 *
 * Unlike a browser client there is no ambient origin here: a `Client` is made with `createClient({ baseUrl })` and
 * every request resolves against that base, or against the absolute URL `atUrl` puts in its place — which is how a
 * generated operation is sent to an endpoint the discovery document advertises rather than to the path the
 * description embeds.
 */

const UNKNOWN_ERROR_CODE = 'unknown'

/** Thrown for any 3xx: the client never follows a redirect, so a navigation endpoint answers the caller, not fetch. */
const REDIRECT_REFUSED_CODE = 'redirect_refused'

/** A declared failure: the status and the error code the operation lists for it. */
export interface ApiFailure<Code extends string = string> {
  status: number
  code: Code
  /** The server's `error_description`. For the developer; callers branch on `code`. */
  message: string
}

/** What a call resolves to: the success body with the response's status and headers, or a failure the operation declares. */
export type Result<Data, Code extends string = string> =
  | { ok: true; status: number; headers: Headers; data: Data }
  | { ok: false; error: ApiFailure<Code> }

/**
 * A response outside the contract the callers handle: a redirect, a 5xx, or a body that cannot be read or carries no
 * code (`unknown`).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** The codes of the 4xx responses an operation declares: the failures that come back as a value. */
export type ErrorCodeOf<Responses> = {
  [Status in keyof Responses]: Status extends `4${string}` ? (Responses[Status] extends { error: infer Code extends string } ? Code : never) : never
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
  /** The request content type the operation declares; `/oidc/token` and the end-session form declare one. */
  contentType?: { request?: string; response?: string }
  /** The headers of the request: the token endpoint's `Authorization: Basic`, userinfo's `Authorization: Bearer`. */
  headers?: Record<string, string>
  /** No mirrored operation declares a path or query parameter; accepted because the generated call passes them. */
  path?: unknown
  query?: unknown
  /** The security schemes the operation declares; the caller sends the credential as a header itself. */
  security?: readonly unknown[]
  /** Ignored: a declared failure always comes back as a value, anything else is always thrown. */
  throwOnError?: boolean
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
 */
export type Options<TOptions, ThrowOnError extends boolean = true> = Omit<TOptions, 'headers'> & {
  headers?: Record<string, string> & DeclaredHeaders<TOptions>
  client?: Client
  throwOnError?: ThrowOnError
}

/**
 * What a generated function resolves to: the success body or a declared 4xx failure. `ThrowOnError` is part of the
 * generated signature and is ignored (see `RequestConfig.throwOnError`).
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type RequestResult<Responses, ThrowOnError extends boolean = true> = Result<SuccessOf<Responses>, ErrorCodeOf<Responses>>

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

/** A failed response as a declared failure (a 4xx with a readable code), or the `ApiError` to throw for anything else. */
const toFailure = async (response: Response): Promise<{ ok: false; error: ApiFailure } | ApiError> => {
  const body = await readBody(response)
  const fallback = response.statusText || 'Request failed'
  const declared = isOAuthErrorBody(body)
    ? { code: body.error, message: asMessage(body.error_description, fallback) }
    : isEnvelopeErrorBody(body)
      ? { code: body.error.code, message: asMessage(body.error.message, fallback) }
      : undefined

  if (declared === undefined) {
    return new ApiError(response.status, UNKNOWN_ERROR_CODE, fallback)
  }
  if (response.status >= 400 && response.status < 500) {
    return { ok: false, error: { status: response.status, ...declared } }
  }
  return new ApiError(response.status, declared.code, declared.message)
}

/** The body as it goes on the wire, and the content type it needs when the caller named none. */
const encodeBody = (body: unknown, declared: string | undefined): { body: string; contentType: string } | undefined => {
  if (body === undefined) {
    return undefined
  }
  // `/oidc/token` and the end-session form take an already-encoded form body: send the string verbatim, never quoted
  // into JSON. Anything else is a JSON body.
  if (typeof body === 'string') {
    return { body, contentType: declared ?? 'application/x-www-form-urlencoded' }
  }
  return { body: JSON.stringify(body), contentType: declared ?? 'application/json' }
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
    const response = await send(new URL(url, baseUrl), {
      method,
      redirect: 'manual',
      // A header the caller named wins over the content type the body encoding would set.
      headers: { ...(encoded === undefined ? {} : { 'Content-Type': encoded.contentType }), ...headers },
      body: encoded?.body,
    })

    // The caller decides what a navigation endpoint's redirect means; `redirect: 'manual'` reports it as an opaque
    // response in a browser-like runtime and as the 3xx itself elsewhere.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new ApiError(response.status, REDIRECT_REFUSED_CODE, `${method} ${url} answered a redirect, which this client does not follow`)
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

    return { ok: true, status: response.status, headers: response.headers, data: await response.json() }
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
