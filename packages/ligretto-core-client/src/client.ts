/**
 * The transport of the ligretto-core clients: every generated function in `./generated/public/operations` and
 * `./generated/internal/operations` calls a `Client`, and nothing else in this package calls `fetch`. It is this package's own, specified by
 * `apps/ligretto-core/docs/adrs/api-contract-openapi-and-client-package.md`.
 *
 * An operation never throws on a status. It resolves to one of five kinds:
 *
 * - `success`: a status the document declares as 2xx, with its JSON body (`undefined` for a 204).
 * - `error`: a status the document declares as 4xx or 5xx, with the **whole** JSON body, typed as the document
 *   declares it for that status, so code-specific fields such as `playerIds` reach the caller. Most bodies are the
 *   `{ error }` envelope; the `503` of `GET /health` is a `HealthReport`. The transport does not check the envelope:
 *   the server's typed handlers hold the declared shape, and the contract tests check every body against the
 *   document.
 * - `redirect`: any 3xx, never followed. The only redirecting routes are browser navigations, which are not fetched.
 * - `unexpected`: an answer outside the declared contract, with its raw text: an undeclared status such as the
 *   `500 internal_error`, a body that is not JSON (a proxy's HTML page), or JSON that is not an object under a
 *   declared 4xx/5xx. It exists so the types promise only what the documents declare.
 * - `transport`: no usable response at all, because `fetch` rejected or the body could not be read.
 *
 * "Declared" is decided at run time from `./generated/declared-statuses`, generated from the same documents as the
 * operations. There is no ambient base URL: a `Client` is made with `createClient({ baseUrl })`.
 */

import { declaredStatuses } from './generated/declared-statuses'

/** The status literal of a response key: `'422'` is `422`. */
type StatusOf<Key> = Key extends `${infer Status extends number}` ? Status : never

/** A declared 2xx, one member per status; a 204 carries `undefined`. */
export type SuccessResult<Responses> = {
  [Key in keyof Responses]: Key extends `2${string}`
    ? { kind: 'success'; ok: true; status: StatusOf<Key>; headers: Headers; data: Key extends '204' ? undefined : Responses[Key] }
    : never
}[keyof Responses]

/** A declared 4xx or 5xx, one member per status, with the whole body the document declares for it. */
export type ErrorResult<Responses> = {
  [Key in keyof Responses]: Key extends `4${string}` | `5${string}`
    ? { kind: 'error'; ok: false; status: StatusOf<Key>; headers: Headers; error: Responses[Key] }
    : never
}[keyof Responses]

/** A 3xx, not followed. A browser reports `redirect: 'manual'` as an `opaqueredirect`: status `0`, no `Location`. */
export interface RedirectResult {
  kind: 'redirect'
  ok: false
  status: number
  headers: Headers
  location: string | null
}

/** An answer outside the declared contract: an undeclared status, or a body that does not fit the status. */
export interface UnexpectedResult {
  kind: 'unexpected'
  ok: false
  status: number
  headers: Headers
  /** The body as it arrived, for the logs. */
  body: string
}

/** No usable response: `fetch` rejected (network, abort) or the body could not be read. */
export interface TransportFailure {
  kind: 'transport'
  ok: false
  cause: unknown
}

/**
 * What a generated function resolves to. `ThrowOnError` is kubb's: plugin-client prints the generic into every
 * operation and offers no option to leave it out. This transport has one policy, so it is ignored; the leading
 * underscore keeps a consumer type-checking this source under `noUnusedParameters` from failing on it.
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type RequestResult<Responses, _ThrowOnError extends boolean = false> =
  | SuccessResult<Responses>
  | ErrorResult<Responses>
  | RedirectResult
  | UnexpectedResult
  | TransportFailure

/** What a `Client` resolves to before the generated function narrows it by the operation's responses. */
export type AnyResult =
  | { kind: 'success'; ok: true; status: number; headers: Headers; data: unknown }
  | { kind: 'error'; ok: false; status: number; headers: Headers; error: unknown }
  | RedirectResult
  | UnexpectedResult
  | TransportFailure

/** What a generated function passes to a `Client`. */
export interface RequestConfig {
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** The path template of the document, `{name}` for a path parameter: also the key into `declaredStatuses`. */
  url: string
  path?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
  /** Every operation of both documents takes and answers JSON, so the request is always sent as JSON. */
  contentType?: { request?: string; response?: string }
  /** The security schemes the operation declares; the caller sends the credential as a header itself. */
  security?: readonly unknown[]
  /** The documents' query arrays are all `form`/`explode`, which is the one serialisation this transport does. */
  styles?: unknown
  signal?: AbortSignal
  /** Always `false` (`throwOnErrorDefault` in `kubb.config.ts`) and not read: no answer is thrown. */
  throwOnError?: false
}

export type Client = (config: RequestConfig) => Promise<AnyResult>

/**
 * The `headers` the generated options type declares. Kubb emits `headers?: never` for an operation without declared
 * header parameters, which is every operation here: the credentials are security schemes. `unknown` for that case,
 * so the intersection below is a no-op; a real declared type survives it.
 */
type DeclaredHeaders<TOptions> = TOptions extends { headers?: infer Declared }
  ? [Exclude<Declared, undefined>] extends [never]
    ? unknown
    : Exclude<Declared, undefined>
  : unknown

/**
 * The options of a generated function: the operation's own, plus the client to call and an `AbortSignal`.
 *
 * `headers` is replaced rather than intersected: `never & Record<string, string>` admits nothing, and the
 * `Authorization` of `listUsers` or of the internal API, or a session cookie, has to go somewhere. `throwOnError`
 * admits no value: a caller cannot ask for a throw that would never happen. `ThrowOnError` is ignored as in
 * `RequestResult`.
 */
// oxlint-disable-next-line no-unused-vars -- the generated functions pass ThrowOnError
export type Options<TOptions, _ThrowOnError extends boolean = false> = Omit<TOptions, 'headers'> & {
  headers?: Record<string, string> & DeclaredHeaders<TOptions>
  client?: Client
  signal?: AbortSignal
  throwOnError?: never
}

export interface ClientOptions {
  /**
   * What every path is appended to: an origin, an origin with a path prefix, or `''` for same-origin relative URLs.
   * Trailing slashes are ignored.
   */
  baseUrl: string
  /** The `fetch` to send with, for a runtime without a global one and for tests. */
  fetch?: typeof globalThis.fetch
  /** Headers sent with every request, such as the internal API's `Authorization`; a call's header of the same name wins. */
  headers?: Record<string, string>
  /** Forwarded to `fetch`: a browser on another origin needs `include` to send the session cookie. */
  credentials?: 'omit' | 'same-origin' | 'include'
}

/** The path template with every `{name}` replaced by its encoded value; a missing one is a caller bug. */
const pathOf = (template: string, path: Record<string, unknown> | undefined): string =>
  template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = path?.[name]
    if (value === undefined || value === null) {
      throw new TypeError(`${template} needs the path parameter ${name}.`)
    }
    return encodeURIComponent(String(value))
  })

/** The query as the documents describe it: an array as repeated keys (`?ids=a&ids=b`), `undefined` left out. */
const queryOf = (query: Record<string, unknown> | undefined): string => {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        search.append(name, String(item))
      }
    }
  }
  const serialised = search.toString()
  return serialised === '' ? '' : `?${serialised}`
}

/**
 * The headers of the request: the JSON content type when there is a body, then the client's defaults, then the
 * call's own. `Headers.set` normalises the name, so a call's `authorization` replaces a default `Authorization`.
 */
const headersOf = (hasBody: boolean, ...layers: (Record<string, string> | undefined)[]): Headers => {
  const merged = new Headers(hasBody ? { 'Content-Type': 'application/json' } : undefined)
  for (const layer of layers) {
    for (const [name, value] of Object.entries(layer ?? {})) {
      merged.set(name, value)
    }
  }
  return merged
}

/** The text as JSON, or `undefined` when it is not JSON. */
const parsed = (text: string): { value: unknown } | undefined => {
  try {
    return { value: JSON.parse(text) }
  } catch {
    return undefined
  }
}

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A client that sends every request to `baseUrl` and follows no redirect. */
export const createClient = ({ baseUrl, fetch: fetchImpl, headers: defaults, credentials }: ClientOptions): Client => {
  const base = baseUrl.replace(/\/+$/, '')

  return async ({ method, url, path, query, body, headers, signal }) => {
    // Typed from `globalThis.fetch` rather than `RequestInfo`, which only `lib.dom` declares: the gameplay backend
    // type-checks this source without the browser globals.
    const send = fetchImpl ?? ((...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args))
    const target = `${base}${pathOf(url, path)}${queryOf(query)}`

    let response: Response
    try {
      response = await send(target, {
        method,
        redirect: 'manual',
        headers: headersOf(body !== undefined, defaults, headers),
        body: body === undefined ? undefined : JSON.stringify(body),
        ...(credentials === undefined ? {} : { credentials }),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (cause) {
      return { kind: 'transport', ok: false, cause }
    }

    // Read as a plain string: the Workers runtime types have no `opaqueredirect`.
    const responseType: string = response.type
    if (responseType === 'opaqueredirect') {
      return { kind: 'redirect', ok: false, status: 0, headers: response.headers, location: null }
    }
    if (response.status >= 300 && response.status < 400) {
      // Nobody reads a redirect's body; cancelling it releases the connection. Best effort.
      response.body?.cancel().catch(() => undefined)
      return { kind: 'redirect', ok: false, status: response.status, headers: response.headers, location: response.headers.get('location') }
    }

    let text: string
    try {
      text = await response.text()
    } catch (cause) {
      return { kind: 'transport', ok: false, cause }
    }

    const { status } = response
    const unexpected: UnexpectedResult = { kind: 'unexpected', ok: false, status, headers: response.headers, body: text }
    if (!(declaredStatuses[`${method} ${url}`] ?? []).includes(status)) {
      return unexpected
    }
    if (status === 204) {
      return { kind: 'success', ok: true, status, headers: response.headers, data: undefined }
    }
    const json = parsed(text)
    if (status >= 200 && status < 300 && json !== undefined) {
      return { kind: 'success', ok: true, status, headers: response.headers, data: json.value }
    }
    if (status >= 400 && json !== undefined && isObject(json.value)) {
      return { kind: 'error', ok: false, status, headers: response.headers, error: json.value }
    }
    return unexpected
  }
}

/**
 * The client the generated operations import when the caller passes none. The package has no ambient base URL — the
 * frontend and the gameplay backend reach ligretto-core at different addresses — so this is a guard, not a default.
 */
export const client: Client = () => {
  throw new Error(
    '@memebattle/ligretto-core-client has no default base URL: make a client with createClient({ baseUrl }) and pass it as the `client` option.',
  )
}
