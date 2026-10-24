import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'
import { activateRuntime, assertNoUnhandledRequests, deactivateRuntime, recordUnhandledRequest, resetRuntime } from './runtime'

activateRuntime(server, () => vi.fn<(args: Record<string, unknown>) => unknown>())
beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      recordUnhandledRequest(request)
      print.error()
    },
  }),
)
afterEach(() => {
  cleanup()
  try {
    assertNoUnhandledRequests()
  } finally {
    resetRuntime()
  }
})
afterAll(() => {
  deactivateRuntime()
  server.close()
})
