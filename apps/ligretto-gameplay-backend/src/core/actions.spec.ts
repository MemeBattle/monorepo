import { describe, expect, it, vi } from 'vitest'
import { dispatch, parseAction } from './actions'

describe('parseAction', () => {
  it('parses an action', () => {
    expect(parseAction('{"type":"a","payload":{"b":1}}')).toEqual({ type: 'a', payload: { b: 1 } })
  })

  it.each([['not json'], ['null'], ['[]'], ['{}'], ['{"type":1}']])('refuses %s', raw => {
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    expect(parseAction(raw)).toBeUndefined()
  })

  it('refuses a binary message', () => {
    expect(parseAction(new ArrayBuffer(1))).toBeUndefined()
  })
})

describe('dispatch', () => {
  it('runs the handler of the type', () => {
    const handler = vi.fn(() => 'done')
    expect(dispatch({ a: handler }, 'ctx', { type: 'a' })).toBe('done')
    expect(handler).toHaveBeenCalledWith('ctx', { type: 'a' })
  })

  it.each(['b', 'constructor', '__proto__', 'toString'])('ignores the unhandled type %s', type => {
    expect(dispatch({}, 'ctx', { type })).toBeUndefined()
  })
})
