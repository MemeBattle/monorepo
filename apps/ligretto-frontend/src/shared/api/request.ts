import { LIGRETTO_CORE_URL } from '#shared/constants/config'

async function fetchRequest<T>(method: string, path: string, body?: unknown, params?: Record<string, unknown>): Promise<{ data: T }> {
  let url = `${LIGRETTO_CORE_URL}${path}`
  if (params) {
    url += `?${new URLSearchParams(params as Record<string, string>).toString()}`
  }
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await response.json()) as T
  return { data }
}

export const request = {
  get: <T>(path: string, config?: { params?: Record<string, unknown> }) => fetchRequest<T>('GET', path, undefined, config?.params),
  post: <T>(path: string, body?: unknown) => fetchRequest<T>('POST', path, body),
}
