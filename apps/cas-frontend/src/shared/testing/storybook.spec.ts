import { afterEach, expect, it, vi } from 'vitest'
import { mockRequest } from './mockRequest'
import { prepareStory } from './storybook'
import { activateRuntime, assertNoUnhandledRequests } from './runtime'
import { server } from './server'

const worker = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), use: vi.fn(), resetHandlers: vi.fn() }))
vi.mock('msw/browser', () => ({ setupWorker: () => worker }))
vi.mock('storybook/test', () => ({ fn: vi.fn }))
afterEach(async () => {
  await prepareStory(false)
  activateRuntime(server, () => vi.fn<(args: Record<string, unknown>) => unknown>())
  vi.clearAllMocks()
})

it('awaits readiness, then resets and registers before render; reruns discard spies', async () => {
  let ready = () => {}
  worker.start.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        ready = resolve
      }),
  )
  const scenario = vi.fn(() => mockRequest('GET', '/api/me').json({ name: 'Ada' }))
  const loading = prepareStory(true, scenario)
  await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce())
  expect(scenario).not.toHaveBeenCalled()
  ready()
  await loading
  const first = scenario.mock.results[0].value
  first({})
  await prepareStory(true, scenario)
  expect(first).not.toHaveBeenCalled()
  expect(scenario).toHaveBeenCalledTimes(2)
  expect(worker.resetHandlers.mock.invocationCallOrder.at(-1)).toBeLessThan(worker.use.mock.invocationCallOrder.at(-1)!)
})

it('stops on non-CAS, rejects out-of-scenario registration, and restarts for CAS', async () => {
  await prepareStory(true)
  await prepareStory(false)
  expect(worker.stop).toHaveBeenCalled()
  expect(() => mockRequest('GET', '/api/me').empty()).toThrow('No testing runtime active')
  await prepareStory(true)
  expect(worker.start).toHaveBeenCalledTimes(2)
})

it('serializes rapid CAS → non-CAS navigation while worker startup is pending', async () => {
  let ready = () => {}
  worker.start.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        ready = resolve
      }),
  )
  const first = prepareStory(true)
  const second = prepareStory(false)
  await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce())
  ready()
  await Promise.all([first, second])
  expect(() => mockRequest('GET', '/api/me').empty()).toThrow('No testing runtime active')
})

it.each([true, false])('clears multiple unanswered request diagnostics when navigating (CAS: %s)', async isCas => {
  await prepareStory(true)
  const { onUnhandledRequest } = worker.start.mock.calls[0][0]
  const print = {
    error: vi.fn(() => {
      throw new Error('MSW blocked')
    }),
  }
  onUnhandledRequest(new Request('http://localhost:6006/assets/story.js'), print)
  expect(print.error).not.toHaveBeenCalled()
  expect(() => onUnhandledRequest(new Request('http://localhost:6006/api/missing'), print)).toThrow('MSW blocked')
  expect(document.querySelector('[data-cas-mock-error]')?.textContent).toContain('Unhandled CAS request: GET')
  expect(() => onUnhandledRequest(new Request('http://localhost:6006/api/also-missing'), print)).toThrow('MSW blocked')
  expect(print.error).toHaveBeenCalledTimes(2)
  await prepareStory(isCas)
  expect(() => assertNoUnhandledRequests()).not.toThrow()
  expect(document.querySelectorAll('[data-cas-mock-error]')).toHaveLength(0)
})
