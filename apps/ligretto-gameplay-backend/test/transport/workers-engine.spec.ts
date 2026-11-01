import { afterEach, describe, expect, it } from 'vitest'
import { connect, connectedClient, nextEvent } from './clients'
import { startWorkerdHost } from './hosts'
import type { TransportHost } from './hosts'

describe('Workers engine only', () => {
  const hosts: TransportHost[] = []

  const start = async () => {
    const host = await startWorkerdHost({})
    hosts.push(host)
    return host
  }

  afterEach(async () => {
    await Promise.all(hosts.map(host => host.close()))
    hosts.length = 0
  })

  it('refuses polling with code 0', async () => {
    const host = await start()

    const response = await fetch(`${host.url}${host.path}?EIO=4&transport=polling`)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ code: 0, message: 'Transport unknown' })
  })

  it('never connects a client with default transports', async () => {
    const host = await start()
    const client = connect(host, { auth: { token: 'valid:user' }, transports: undefined })

    await nextEvent(client, 'connect_error')

    expect(client.connected).toBe(false)
  })

  it('fills socket.handshake from the fetch request', async () => {
    const host = await start()
    const client = await connectedClient(host, 'valid:user', { query: { room: 'r1' } })

    const handshake = await client.timeout(5_000).emitWithAck('handshake')

    expect(handshake.transport).toBe('websocket')
    expect(handshake.secure).toBe(false)
    expect(handshake.url).toContain(`${host.path}?`)
    expect(handshake.query).toMatchObject({ EIO: '4', transport: 'websocket', room: 'r1' })
    expect(handshake.headers.upgrade).toBe('websocket')
    expect(handshake.address).toBe('127.0.0.1')
  })
})
