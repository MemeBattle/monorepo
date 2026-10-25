import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { createConsoleLogger } from './console-logger'

describe('createConsoleLogger', () => {
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  const lines = (spy: MockInstance<(...args: unknown[]) => void>) =>
    spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes one JSON line per call with the level, the time, the message and the fields', () => {
    createConsoleLogger({ level: 'info' }).info('request', { status: 200 })
    expect(log).toHaveBeenCalledTimes(1)
    const [line] = lines(log)
    expect(line).toMatchObject({ level: 'info', message: 'request', status: 200 })
    expect(new Date(String(line?.time)).toISOString()).toBe(line?.time)
  })

  it('keeps its own level, time and message when the fields carry the same names', () => {
    createConsoleLogger({ level: 'info' }).child({ level: 'bound' }).error('request_failed', { message: 'boom', time: 'then', requestId: 'r-1' })
    const [line] = lines(error)
    expect(line).toMatchObject({ level: 'error', message: 'request_failed', requestId: 'r-1' })
    expect(new Date(String(line?.time)).toISOString()).toBe(line?.time)
  })

  it('drops debug at info and writes it at debug', () => {
    createConsoleLogger({ level: 'info' }).debug('hidden')
    expect(log).not.toHaveBeenCalled()
    createConsoleLogger({ level: 'debug' }).debug('shown')
    expect(lines(log)).toMatchObject([{ level: 'debug', message: 'shown' }])
  })

  it('sends warn and error to console.error', () => {
    const logger = createConsoleLogger({ level: 'info' })
    logger.warn('careful')
    logger.error('broken')
    expect(log).not.toHaveBeenCalled()
    expect(lines(error)).toMatchObject([
      { level: 'warn', message: 'careful' },
      { level: 'error', message: 'broken' },
    ])
  })

  it('binds the fields of a child into every later line', () => {
    const child = createConsoleLogger({ level: 'info' }).child({ requestId: 'r-1' })
    child.info('one')
    child.error('two')
    expect(lines(log)[0]).toMatchObject({ requestId: 'r-1' })
    expect(lines(error)[0]).toMatchObject({ requestId: 'r-1' })
  })

  it('drops fields whose names suggest a secret', () => {
    createConsoleLogger({ level: 'info' })
      .child({ token: 'bound-token' })
      .info('request', { authorization: 'Bearer x', cookie: 'sid=1', clientSecret: 's', password: 'p', path: '/health' })
    const [line] = lines(log)
    expect(line).toMatchObject({ path: '/health' })
    for (const key of ['token', 'authorization', 'cookie', 'clientSecret', 'password']) {
      expect(line).not.toHaveProperty(key)
    }
    expect(String(log.mock.calls[0]?.[0])).not.toMatch(/bound-token|Bearer|sid=1/)
  })
})
