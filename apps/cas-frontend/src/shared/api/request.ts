/**
 * Thin fetch wrapper for the CAS API.
 *
 * The SPA and the API share one origin in production, so paths are relative
 * (`/api/...`) and there is no base URL and no `credentials` option: the session
 * cookie is same-origin and rides along on its own. In development vite proxies
 * `/api` to the CAS dev server, which keeps the origin the same there too.
 */

const UNKNOWN_ERROR_CODE = 'unknown'

/** A CAS error response: `{ "error": { "code", "message" } }`. 401 is always `unauthenticated`. */
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

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

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

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

export const request = async <T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> => {
  const hasBody = body !== undefined

  const response = await fetch(path, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  // Logout and passkey deletion answer 204 with no body to parse.
  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
