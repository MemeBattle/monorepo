import { describe, expect, it } from 'vitest'
import { isWebSocketUpgrade, toEngineRequest, verifyHandshake } from '../handshake'

const requestTo = (search: string, { method = 'GET', upgrade = 'websocket' }: { method?: string; upgrade?: string } = {}) =>
  toEngineRequest(new Request(`https://ligretto.test/socket.io/${search}`, { method, headers: { upgrade } }))

describe('toEngineRequest', () => {
  it('maps a fetch request to the fields of an IncomingMessage', () => {
    const request = toEngineRequest(
      new Request('https://ligretto.test/socket.io/?EIO=4&transport=websocket', {
        headers: { 'X-Custom': 'value', 'CF-Connecting-IP': '203.0.113.7' },
      }),
    )

    expect(request).toEqual({
      method: 'GET',
      url: '/socket.io/?EIO=4&transport=websocket',
      headers: { 'x-custom': 'value', 'cf-connecting-ip': '203.0.113.7' },
      _query: { EIO: '4', transport: 'websocket' },
      connection: { encrypted: true, remoteAddress: '203.0.113.7' },
    })
  })

  it('treats plain http as not encrypted and leaves the address empty without the header', () => {
    const { connection } = toEngineRequest(new Request('http://127.0.0.1/socket.io/'))

    expect(connection).toEqual({ encrypted: false, remoteAddress: undefined })
  })
})

describe('isWebSocketUpgrade', () => {
  it.each(['websocket', 'WebSocket', 'WEBSOCKET'])('accepts %s', upgrade => {
    expect(isWebSocketUpgrade(requestTo('', { upgrade }))).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isWebSocketUpgrade(requestTo('', { upgrade: 'h2c' }))).toBe(false)
  })
})

describe('verifyHandshake', () => {
  it('accepts a websocket upgrade of protocol 4', () => {
    expect(verifyHandshake(requestTo('?EIO=4&transport=websocket'), true)).toBeUndefined()
  })

  it.each([
    ['an unknown transport', '?EIO=4&transport=x', 'GET', true, { code: 0, message: 'Transport unknown', context: { transport: 'x' } }],
    ['polling', '?EIO=4&transport=polling', 'GET', true, { code: 0, message: 'Transport unknown', context: { transport: 'polling' } }],
    ['a session id', '?EIO=4&transport=websocket&sid=abc', 'GET', true, { code: 1, message: 'Session ID unknown', context: { sid: 'abc' } }],
    ['another method', '?EIO=4&transport=websocket', 'POST', true, { code: 2, message: 'Bad handshake method', context: { method: 'POST' } }],
    [
      'a request without an upgrade',
      '?EIO=4&transport=websocket',
      'GET',
      false,
      { code: 3, message: 'Bad request', context: { name: 'TRANSPORT_HANDSHAKE_ERROR' } },
    ],
    ['another protocol', '?EIO=3&transport=websocket', 'GET', true, { code: 5, message: 'Unsupported protocol version', context: { protocol: '3' } }],
  ])('refuses %s', (_name, search, method, isUpgrade, refusal) => {
    expect(verifyHandshake(requestTo(search, { method }), isUpgrade)).toEqual(refusal)
  })

  it.each([
    ['transport before session id', '?EIO=3&transport=polling&sid=abc', 'POST', false, 0],
    ['session id before method', '?EIO=3&transport=websocket&sid=abc', 'POST', false, 1],
    ['method before upgrade', '?EIO=3&transport=websocket', 'POST', false, 2],
    ['upgrade before protocol', '?EIO=3&transport=websocket', 'GET', false, 3],
  ])('checks %s', (_name, search, method, isUpgrade, code) => {
    expect(verifyHandshake(requestTo(search, { method }), isUpgrade)?.code).toBe(code)
  })
})
