import { stringify } from 'qs'
import type { ErrorLoggerFunction, SuccessLoggerFunction } from './types'

type RequestConfig = {
  headers?: Record<string, string>
  params?: Record<string, unknown>
}

export type HttpClient = {
  get: <T>(url: string, config?: RequestConfig) => Promise<T>
  post: <T>(url: string, data?: unknown, config?: RequestConfig) => Promise<T>
  patch: <T>(url: string, data?: unknown, config?: RequestConfig) => Promise<T>
}

export const createBaseRequest = ({
  casURI,
  errorLogger,
  successLogger,
}: {
  casURI: string
  successLogger?: SuccessLoggerFunction
  errorLogger?: ErrorLoggerFunction
}): HttpClient => {
  const doRequest = async <T>(method: string, path: string, body?: unknown, config?: RequestConfig): Promise<T> => {
    let url = `${casURI}${path}`
    if (config?.params) {
      url += `?${stringify(config.params, { arrayFormat: 'repeat', indices: false })}`
    }

    const headers: Record<string, string> = { ...config?.headers }
    let fetchBody: BodyInit | undefined
    if (body instanceof FormData) {
      fetchBody = body
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      fetchBody = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await fetch(url, { method, headers, body: fetchBody })
    } catch (error) {
      if (errorLogger) { errorLogger(error) }
      return { success: false, error, errorCode: 500 } as T
    }

    const data = (await response.json()) as T
    if (successLogger) {
      const headersObj = Object.fromEntries(response.headers.entries())
      successLogger(response.status, data, headersObj, url)
    }
    return data
  }

  return {
    get: (url, config) => doRequest('GET', url, undefined, config),
    post: (url, data, config) => doRequest('POST', url, data, config),
    patch: (url, data, config) => doRequest('PATCH', url, data, config),
  }
}
