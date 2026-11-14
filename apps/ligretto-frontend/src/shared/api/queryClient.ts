import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './ApiError'

const MAX_RETRIES = 3

const isClientError = (error: unknown) => {
  const status = error instanceof ApiError ? error.failure.status : undefined
  return status !== undefined && status >= 400 && status < 500
}

/** A `4xx` is not retried, because it fails the same way on every attempt. Any other error is retried. */
export const shouldRetry = (failureCount: number, error: unknown) => !isClientError(error) && failureCount < MAX_RETRIES

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry },
    },
  })
