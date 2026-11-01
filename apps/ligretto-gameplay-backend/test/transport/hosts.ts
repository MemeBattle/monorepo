import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { inject } from 'vitest'
import { NodeSocketEngine } from '../../src/socket-engine/node-socket-engine'
import { createContractServer } from './contract-server'
import type { ContractOptions, ControlCommand } from './contract-server'

export interface TransportHost {
  url: string
  path: string
  control<Result = null>(command: ControlCommand): Promise<Result>
  close(): Promise<void>
}

export const startNodeHost = async (options: ContractOptions): Promise<TransportHost> => {
  const httpServer = createServer()
  const server = createContractServer(new NodeSocketEngine(httpServer), options)
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address() as AddressInfo

  const control = async <Result>(command: ControlCommand) => JSON.parse(JSON.stringify((await server.control(command)) ?? null)) as Result

  return {
    url: `http://127.0.0.1:${port}`,
    path: '/socket.io/',
    control,
    close: async () => {
      await control({ type: 'shutdown' })
    },
  }
}

export const startWorkerdHost = async (options: ContractOptions): Promise<TransportHost> => {
  const url = inject('workerdOrigin')
  const instance = `${url}/instances/${randomUUID()}`

  const post = async (route: string, body: unknown) => {
    const response = await fetch(`${instance}${route}`, { method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) {
      throw new Error(`POST ${route} answered ${response.status}: ${await response.text()}`)
    }
    return response
  }

  await post('/configure', options)

  const control = async <Result>(command: ControlCommand) => (await (await post('/control', command)).json()) as Result

  return {
    url,
    path: `${new URL(instance).pathname}/socket.io/`,
    control,
    close: async () => {
      await control({ type: 'shutdown' })
    },
  }
}
