import { AsyncLocalStorage } from 'node:async_hooks'

import { createLazyClient, createScopedDatabase } from '../adapters/pg/database.ts'
import type { DatabaseHandles, LazyClient } from '../adapters/pg/database.ts'

type Scope = { main: LazyClient; locks: LazyClient }

/** The connection strings of one request: on Workers, the two Hyperdrive bindings. */
export type ScopeBindings = { main: string; locks: string }

export interface RequestScopeRunner {
  /** One database per handle for the isolate; each statement resolves the client of the request it runs in. */
  handles: DatabaseHandles
  /**
   * Runs `fn` in a request scope: a statement on a handle opens that handle's client on first use; when `fn` settles,
   * the scope's clients are closed in `waitUntil`, after the response.
   */
  run<T>(bindings: ScopeBindings, waitUntil: (promise: Promise<unknown>) => void, fn: () => Promise<T>): Promise<T>
}

/**
 * The per-request connections of the Worker (docs/adrs/database-access-with-kysely.md). The apps are composed once
 * per isolate, so the databases they receive are too; the request each statement belongs to is found through an
 * `AsyncLocalStorage` scope that the entry opens around every request.
 */
export const createRequestScopeRunner = ({
  openClient = createLazyClient,
}: { openClient?: (connectionString: string) => LazyClient } = {}): RequestScopeRunner => {
  const storage = new AsyncLocalStorage<Scope>()
  const current = (): Scope => {
    const scope = storage.getStore()
    if (scope === undefined) {
      // A bug: every request the entry dispatches runs inside a scope.
      throw new Error('database used outside a request scope')
    }
    return scope
  }

  return {
    handles: {
      main: createScopedDatabase(() => current().main.connect()),
      locks: createScopedDatabase(() => current().locks.connect()),
    },
    run: (bindings, waitUntil, fn) => {
      const scope: Scope = { main: openClient(bindings.main), locks: openClient(bindings.locks) }
      return storage.run(scope, async () => {
        try {
          return await fn()
        } finally {
          waitUntil(Promise.all([scope.main.close(), scope.locks.close()]))
        }
      })
    },
  }
}
