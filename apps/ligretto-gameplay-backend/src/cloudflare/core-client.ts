import { createClient, type Client } from '@memebattle/ligretto-core-client/internal'
import type { Env } from './env'

/** Covers the headers and the body: the client reads both under the signal. */
const CORE_REQUEST_TIMEOUT_MS = 3_000

/**
 * `LIGRETTO_INTERNAL_API_TOKEN` takes the server's format, a comma-separated list of one or two values, so a rotation
 * adds the new value to the server, switches this one, then removes the old one
 * (`apps/ligretto-core-backend/docs/adrs/internal-api-and-service-authentication.md`).
 */
const firstToken = (tokens: string) =>
  tokens
    .split(',')
    .map(value => value.trim())
    .find(value => value !== '') ?? ''

/**
 * `LIGRETTO_CORE_URL` is an origin with no `/api`, since the paths of the internal API start with `/internal`. Every
 * request gets its own deadline: an expiry resolves as a `transport` result, so a silent core fails like an absent one.
 */
export const createCoreClient = (env: Env): Client => {
  const client = createClient({
    baseUrl: env.LIGRETTO_CORE_URL,
    headers: { authorization: `Bearer ${firstToken(env.LIGRETTO_INTERNAL_API_TOKEN)}` },
  })

  return config => {
    const deadline = AbortSignal.timeout(CORE_REQUEST_TIMEOUT_MS)
    return client({ ...config, signal: config.signal ? AbortSignal.any([config.signal, deadline]) : deadline })
  }
}
