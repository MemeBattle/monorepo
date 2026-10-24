import { LIGRETTO_CORE_URL } from '#shared/constants/config'

// Flat params only (strings, numbers, arrays); arrays are repeated: ids=a&ids=b
export const buildSearchParams = (params: Record<string, unknown>): URLSearchParams => {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, String(item))
      }
    } else {
      searchParams.append(key, String(value))
    }
  }
  return searchParams
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed with status ${status}`)
    this.name = 'RequestError'
  }
}

async function fetchRequest<T>(method: string, path: string, body?: unknown, params?: Record<string, unknown>): Promise<{ data: T }> {
  let url = `${LIGRETTO_CORE_URL}${path}`
  if (params) {
    url += `?${buildSearchParams(params).toString()}`
  }
  const response = await fetch(url, {
    method,
    // The session is a cookie on the API origin, cross-origin in development.
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    throw new RequestError(response.status, body)
  }
  const data = (await response.json()) as T
  return { data }
}

export const request = {
  get: <T>(path: string, config?: { params?: Record<string, unknown> }) => fetchRequest<T>('GET', path, undefined, config?.params),
  post: <T>(path: string, body?: unknown) => fetchRequest<T>('POST', path, body),
}
