import type { DurableObjectNamespace, Request as WorkersRequest, Response as WorkersResponse } from '@cloudflare/workers-types'
import { WorkersEngine } from '../../../src/socket-engine/workers/workers-engine'
import { createContractServer } from '../contract-server'
import type { ContractOptions, ContractServer, ControlCommand } from '../contract-server'

declare const Response: typeof import('@cloudflare/workers-types').Response

interface Env {
  TRANSPORT_INSTANCE: DurableObjectNamespace
}

const INSTANCE_PATH = /^\/instances\/([^/]+)(\/.*)$/

const notFound = () => new Response(null, { status: 404 })

export default {
  fetch(request: WorkersRequest, env: Env): WorkersResponse | Promise<WorkersResponse> {
    const { pathname } = new URL(request.url)
    if (pathname === '/health') {
      return new Response(null, { status: 200 })
    }
    const instanceId = INSTANCE_PATH.exec(pathname)?.[1]
    if (instanceId === undefined) {
      return notFound()
    }
    return env.TRANSPORT_INSTANCE.get(env.TRANSPORT_INSTANCE.idFromName(instanceId)).fetch(request)
  },
}

/** The Socket.IO server starts in `configure`, not at module scope: the Workers global scope may not start timers. */
export class TransportInstance {
  private engine?: WorkersEngine
  private server?: ContractServer

  async fetch(request: WorkersRequest): Promise<WorkersResponse> {
    const route = INSTANCE_PATH.exec(new URL(request.url).pathname)?.[2]

    if (route === '/configure' && request.method === 'POST') {
      const options = await request.json<ContractOptions>()
      const { pingInterval, pingTimeout, maxHttpBufferSize } = options
      this.engine = new WorkersEngine({ pingInterval, pingTimeout, maxHttpBufferSize })
      this.server = createContractServer(this.engine, options)
      return new Response(null, { status: 204 })
    }
    if (!this.engine || !this.server) {
      return notFound()
    }
    if (route === '/control' && request.method === 'POST') {
      return new Response(JSON.stringify((await this.server.control(await request.json<ControlCommand>())) ?? null))
    }
    return this.engine.handleRequest(request)
  }
}
