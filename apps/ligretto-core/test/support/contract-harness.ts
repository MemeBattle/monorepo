/**
 * Both apps composed for the contract tests of other packages, exported as `@memebattle/ligretto-core/contract-harness`
 * (docs/adrs/api-contract-openapi-and-client-package.md). `packages/ligretto-core-client` drives its generated
 * operations through the `fetch` functions here, so they reach `createPublicApp` and `createInternalApp` over PGlite
 * without a network.
 *
 * The harness holds one PGlite database for its whole life. Everything else is a composition that `reset()` throws
 * away and rebuilds: the CAS metadata `fetch`, the access-token verifier with its own cold metadata cache, the session
 * store, the scripted auth stubs and the three apps. Every scripted failure lives in the composition, so a case never
 * inherits one from the case before it. The `fetch` functions read the current composition at call time, so a client
 * made once keeps reaching the fresh apps after every `reset()`.
 */
import { ApiError, createInMemorySessionStore, TokenEndpointError } from '@memebattle/ligretto-auth'
import type { CasClient, SessionStore, SessionTransportKind } from '@memebattle/ligretto-auth'

import { createPgGamesRepository } from '../../src/adapters/pg/games-repository'
import { createPgDatabaseProbe } from '../../src/adapters/pg/probe'
import { createPgUsersRepository } from '../../src/adapters/pg/users-repository'
import type { AuthConfig } from '../../src/core/config'
import { createFixedClock } from '../../src/core/ports/clock.fake'
import type { DatabaseProbe } from '../../src/core/ports/database-probe'
import { createRecordingLogger } from '../../src/core/ports/logger.fake'
import { SessionBusyError } from '../../src/core/ports/session-store'
import type { UserProfile } from '../../src/core/ports/users-repository'
import { createAuth } from '../../src/entry/auth'
import { createInternalApp } from '../../src/http/internal-app'
import { createPublicApp } from '../../src/http/public-app'
import { createAuthStub, type AuthStub } from './auth-stub'
import { casFetch, ISSUER, type CasFetch } from './cas-tokens'
import { createTestDatabase } from './pglite'
import { seedUsers } from './seed'

export { APP_URL, AUTHORIZATION_URL, END_SESSION_URL, STATE } from './auth-stub'
export { mintAccessToken } from './cas-tokens'
export type { UserProfile } from '../../src/core/ports/users-repository'

/** The one value of `LIGRETTO_INTERNAL_API_TOKEN` the internal app accepts. */
export const INTERNAL_TOKEN = 'contract-internal-token'

/** The configuration of the access-token verifier; its handlers are discarded for the stubs'. */
const config: AuthConfig = {
  casIssuer: ISSUER,
  clientId: 'ligretto',
  clientSecret: 'a-secret',
  redirectUri: 'https://ligretto.example/api/auth/callback',
  postLogoutRedirectUri: 'https://ligretto.example/',
  appUrl: 'https://ligretto.example/',
  sessionTransport: 'cookie',
}

/**
 * How CAS refuses every call of the stubs' `CasClient`: unreachable (`503 cas_unavailable`), refusing this client
 * (`503 cas_rejected`), or rate-limiting it (`429 rate_limit_exceeded` with `Retry-After: 30`).
 */
export type CasRefusal = 'unavailable' | 'rejected' | 'rate_limited'

export interface ContractHarness {
  /** A `fetch` that answers from the current composition's public app in `transport`. */
  publicFetch(transport: SessionTransportKind): typeof globalThis.fetch
  /** A `fetch` that answers from the current composition's internal app, which accepts `INTERNAL_TOKEN`. */
  internalFetch: typeof globalThis.fetch
  /** Seeds profiles through the service's own snapshot write. */
  seedUsers(profiles: UserProfile[]): Promise<void>
  cas: {
    /** From now on every `CasClient` method of both stubs throws the refusal. */
    refuse(refusal: CasRefusal): void
    /** From now on the verifier's metadata requests fail, as against an unreachable CAS. */
    metadataDown(): void
  }
  sessions: {
    /** From now on every session store method throws `SessionBusyError`, the mount's `503 session_busy`. */
    busy(): void
  }
  database: {
    /** From now on the health probe rejects, so `/health` answers `503`; the database itself stays usable. */
    down(): void
  }
  /** Empties the tables and builds a new composition, which carries no scripted failure. */
  reset(): Promise<void>
  close(): Promise<void>
}

interface Composition {
  cas: CasFetch
  stubs: Record<SessionTransportKind, AuthStub>
  publicApps: Record<SessionTransportKind, ReturnType<typeof createPublicApp>>
  internalApp: ReturnType<typeof createInternalApp>
  busy(): void
  down(): void
}

/** The store, with a switch that makes every method throw what the Postgres store throws when a lock is not granted. */
const switchableStore = (inner: SessionStore): { store: SessionStore; busy(): void } => {
  let busy = false
  const guard = <T>(work: () => Promise<T>): Promise<T> => (busy ? Promise.reject(new SessionBusyError('deadline')) : work())
  return {
    store: {
      getSession: id => guard(() => inner.getSession(id)),
      saveSession: session => guard(() => inner.saveSession(session)),
      deleteSession: id => guard(() => inner.deleteSession(id)),
      savePendingRequest: request => guard(() => inner.savePendingRequest(request)),
      takePendingRequest: state => guard(() => inner.takePendingRequest(state)),
      withSessionLock: (sessionId, fn) => guard(() => inner.withSessionLock(sessionId, fn)),
    },
    busy: () => {
      busy = true
    },
  }
}

/** The probe of `db`, with a switch that makes it reject. */
const switchableProbe = (inner: DatabaseProbe): { probe: DatabaseProbe; down(): void } => {
  let down = false
  return {
    probe: { ping: () => (down ? Promise.reject(new Error('the database is down')) : inner.ping()) },
    down: () => {
      down = true
    },
  }
}

/** What every method of a refusing CAS client throws, as the CAS client of the package throws it. */
const refusalError = (refusal: CasRefusal): Error => {
  switch (refusal) {
    case 'unavailable':
      return new ApiError(0, 'unreachable', 'CAS could not be reached')
    case 'rejected':
      return new TokenEndpointError('invalid_client', 401, 'CAS refused this client')
    case 'rate_limited':
      return new TokenEndpointError('rate_limit_exceeded', 429, 'CAS is rate-limiting this client', { headers: new Headers({ 'retry-after': '30' }) })
  }
}

const refuseAll = (client: CasClient, refusal: CasRefusal): void => {
  const fail = async (): Promise<never> => {
    throw refusalError(refusal)
  }
  client.authorizationRequest = fail
  client.exchangeCode = fail
  client.refresh = fail
  client.guestGrant = fail
  client.endSessionUrl = fail
}

export const createContractHarness = async (): Promise<ContractHarness> => {
  const database = await createTestDatabase()
  const { db } = database

  const compose = (): Composition => {
    const cas = casFetch()
    const { verifyAccessToken } = createAuth({ config, databases: { main: db, locks: db }, clock: createFixedClock(), fetch: cas.fetch })
    const sessions = switchableStore(createInMemorySessionStore())
    const health = switchableProbe(createPgDatabaseProbe(db))
    const stubs = {
      cookie: createAuthStub({ transport: 'cookie', store: sessions.store }),
      bearer: createAuthStub({ transport: 'bearer', store: sessions.store }),
    }
    const shared = { logger: createRecordingLogger().logger, clock: createFixedClock(), database: health.probe }
    const publicApp = (stub: AuthStub) => createPublicApp({ ...shared, auth: stub.handlers, users: createPgUsersRepository(db), verifyAccessToken })
    return {
      cas,
      stubs,
      publicApps: { cookie: publicApp(stubs.cookie), bearer: publicApp(stubs.bearer) },
      internalApp: createInternalApp({ ...shared, games: createPgGamesRepository(db), internalTokens: [INTERNAL_TOKEN] }),
      busy: sessions.busy,
      down: health.down,
    }
  }

  let current = compose()

  return {
    publicFetch: transport => async (input, init) => await current.publicApps[transport].fetch(new Request(input, init)),
    internalFetch: async (input, init) => await current.internalApp.fetch(new Request(input, init)),
    seedUsers: async profiles => await seedUsers(db, profiles),
    cas: {
      refuse: refusal => {
        refuseAll(current.stubs.cookie.client, refusal)
        refuseAll(current.stubs.bearer.client, refusal)
      },
      metadataDown: () => current.cas.fail(),
    },
    sessions: { busy: () => current.busy() },
    database: { down: () => current.down() },
    reset: async () => {
      // `users` last: rounds and sessions name their accounts.
      await db.deleteFrom('round_users').execute()
      await db.deleteFrom('rounds').execute()
      await db.deleteFrom('games').execute()
      await db.deleteFrom('sessions').execute()
      await db.deleteFrom('session_locks').execute()
      await db.deleteFrom('auth_requests').execute()
      await db.deleteFrom('users').execute()
      current = compose()
    },
    close: () => database.close(),
  }
}
