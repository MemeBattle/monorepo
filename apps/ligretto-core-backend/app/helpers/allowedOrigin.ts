/**
 * Which browser origin may talk to this API, as an exact check and never a prefix one.
 *
 * `config/cors.ts` answers with `credentials: true`, so the browser sends the session cookie to every origin this
 * returns true for: `http://localhost.attacker.example` — a name anybody can register — starts with
 * `http://localhost` and must not be one of them.
 *
 * The production origin matches by string equality. The development origins match by a *parsed* hostname, so any
 * port of the local frontends is reachable (5173 for plain development, 5174 for the local SSO stack) and nothing
 * else is; that arm is off in production. An origin that does not parse, or that carries anything beyond scheme,
 * host and port, is refused.
 *
 * The environment comes in as an argument rather than being read here, which keeps the predicate a pure function
 * the unit suite can cover for both environments.
 */

const PRODUCTION_ORIGIN = 'https://ligretto.app'

/** The hosts the development frontends are served from, over `http:` and on any port. */
const DEVELOPMENT_HOSTNAMES = ['localhost', '127.0.0.1']

export const isOriginAllowed = (requestOrigin: string, nodeEnv: string | undefined): boolean => {
  if (requestOrigin === PRODUCTION_ORIGIN) {
    return true
  }

  if (nodeEnv === 'production') {
    return false
  }

  let parsed: URL
  try {
    parsed = new URL(requestOrigin)
  } catch {
    return false
  }

  // `parsed.origin` drops a path, a query and any userinfo, so comparing it back to the header is what makes the
  // match exact rather than merely host-based.
  return parsed.origin === requestOrigin && parsed.protocol === 'http:' && DEVELOPMENT_HOSTNAMES.includes(parsed.hostname)
}
