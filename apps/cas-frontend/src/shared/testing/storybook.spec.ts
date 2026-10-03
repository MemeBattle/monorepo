import { afterEach, expect, it, vi } from 'vitest'
import type { RequestHandler } from 'msw'
import { mockRequest } from './mockRequest'
import { setupStoryMocks } from './storybook'
import { activateRuntime, assertNoUnhandledRequests, deactivateRuntime } from './runtime'
import { server } from './server'

const worker = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), use: vi.fn(), resetHandlers: vi.fn() }))
vi.mock('msw/browser', () => ({
  setupWorker: (...handlers: RequestHandler[]) => {
    server.use(...handlers)
    return worker
  },
}))
vi.mock('storybook/test', () => ({ fn: vi.fn }))
let cleanup: (() => void) | undefined
const setup = async () => {
  cleanup = await setupStoryMocks(true, new AbortController().signal)
}

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  activateRuntime(server, () => vi.fn<(args: Record<string, unknown>) => unknown>())
  vi.clearAllMocks()
})

it('awaits worker readiness before activating helpers, then cleans handlers and spies on unmount', async () => {
  deactivateRuntime()
  let ready = () => {}
  worker.start.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        ready = resolve
      }),
  )
  const loading = setup()
  expect(() => mockRequest('GET', '/api/me').empty()).toThrow('No testing runtime active')
  ready()
  await loading
  const first = mockRequest('GET', '/api/me').empty()
  first({})
  cleanup?.()
  expect(first).not.toHaveBeenCalled()
  expect(worker.resetHandlers).toHaveBeenCalledOnce()
  expect(worker.stop).toHaveBeenCalledOnce()
  expect(() => mockRequest('GET', '/api/me').empty()).toThrow('No testing runtime active')
  await setup()
  mockRequest('GET', '/api/me').empty()
  expect(worker.start).toHaveBeenCalledTimes(2)
  expect(worker.resetHandlers.mock.invocationCallOrder[0]).toBeLessThan(worker.use.mock.invocationCallOrder.at(-1)!)
})

it('does not start interception for non-CAS stories', async () => {
  deactivateRuntime()
  expect(await setupStoryMocks(false, new AbortController().signal)).toBeUndefined()
  expect(worker.start).not.toHaveBeenCalled()
  expect(() => mockRequest('GET', '/api/me').empty()).toThrow('No testing runtime active')
})

it('stops a cancelled startup without activating a stale runtime', async () => {
  deactivateRuntime()
  const controller = new AbortController()
  let ready = () => {}
  worker.start.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        ready = resolve
      }),
  )
  const loading = setupStoryMocks(true, controller.signal)
  controller.abort()
  ready()
  expect(await loading).toBeUndefined()
  expect(worker.stop).toHaveBeenCalledOnce()
  expect(() => mockRequest('GET', '/api/me').empty()).toThrow('No testing runtime active')
})

it('cleans up failed startup and allows the next story to start', async () => {
  worker.start.mockRejectedValueOnce(new Error('startup failed'))
  await expect(setup()).rejects.toThrow('startup failed')
  expect(worker.stop).toHaveBeenCalledOnce()
  await setup()
  expect(() => mockRequest('GET', '/api/me').empty()).not.toThrow()
})

it('rejects missing API mocks even when their URLs look like assets, and clears diagnostics on cleanup', async () => {
  deactivateRuntime()
  await setup()
  await expect(fetch('/api/missing')).rejects.toThrow()
  expect(document.querySelector('[data-cas-mock-error]')?.textContent).toContain('Unhandled CAS request: GET')
  await expect(fetch('/api/missing.js')).rejects.toThrow()
  expect(document.querySelectorAll('[data-cas-mock-error]')).toHaveLength(2)
  cleanup?.()
  cleanup = undefined
  expect(() => assertNoUnhandledRequests()).not.toThrow()
  expect(document.querySelectorAll('[data-cas-mock-error]')).toHaveLength(0)
})
