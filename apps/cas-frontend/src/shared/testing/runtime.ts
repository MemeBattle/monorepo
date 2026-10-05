import type { RequestHandler } from 'msw'

export interface Spy<Args = Record<string, unknown>> {
  (args: Args): unknown
  mockClear(): unknown
  mock: { calls: unknown[][] }
}
export type SpyFactory = () => Spy
interface Runtime {
  use(...handlers: RequestHandler[]): void
  resetHandlers(): void
}
let active: { runtime: Runtime; spyFactory: SpyFactory } | undefined
const spies = new Set<Spy>()
const unanswered: string[] = []

export const activateRuntime = (runtime: Runtime, spyFactory: SpyFactory) => {
  if (active) {
    resetRuntime()
  }
  active = { runtime, spyFactory }
}
export const createSpy = <Args = Record<string, unknown>>(): Spy<Args> => {
  if (!active) {
    throw new Error('No testing runtime active. Register helpers inside a test or a story scenario.')
  }
  const spy = active.spyFactory()
  spies.add(spy)
  return spy as Spy<Args>
}
export const registerHandler = (handler: RequestHandler) => {
  if (!active) {
    throw new Error('No testing runtime active')
  }
  active.runtime.use(handler)
}
export const recordUnhandledRequest = (request: Request) => {
  unanswered.push(`Unhandled CAS request: ${request.method} ${request.url}. Declare an entity testing helper.`)
}
export const consumeUnhandledRequests = () => unanswered.splice(0)
export const assertNoUnhandledRequests = () => {
  const messages = consumeUnhandledRequests()
  if (messages.length) {
    throw new Error(messages.join('\n'))
  }
}
export const resetRuntime = () => {
  active?.runtime.resetHandlers()
  for (const spy of spies) {
    spy.mockClear()
  }
  spies.clear()
}
export const deactivateRuntime = () => {
  resetRuntime()
  active = undefined
}
