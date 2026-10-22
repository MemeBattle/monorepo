/**
 * The application's HTTP face: the four handlers of `src/handlers.ts` mounted on a real local socket, so the suite
 * drives them with real `fetch` requests over TCP rather than by calling the functions.
 *
 * The status line, the repeated `Set-Cookie` headers a callback sends, the cookies a browser then presents back and
 * the `Location` a redirect carries all go through an HTTP stack here instead of being read off a `Response` object
 * in the same process.
 *
 * The adapter is a test fixture, not part of the package: `node:http` lives behind the local declaration in
 * `./node-http.d.ts`, and `src/` keeps using web standards alone. A consumer mounting the handlers brings its own
 * framework.
 */

import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { AuthHandlers } from '../../src/index'

/** The routes, at the paths `appUrl` and the registered redirect URI name. */
const routeOf = (handlers: AuthHandlers, pathname: string): ((request: Request) => Promise<Response>) | undefined => {
  switch (pathname) {
    case '/auth/me':
      return handlers.me
    case '/auth/sign-in':
      return handlers.signIn
    case '/auth/callback':
      return handlers.callback
    case '/auth/logout':
      return handlers.logout
    default:
      return undefined
  }
}

export interface AppServer {
  /** Where the handlers are served, with no trailing slash: `http://127.0.0.1:<port>`. */
  baseUrl: string
  close(): Promise<void>
}

const headersOf = (incoming: Record<string, string | string[] | undefined>): Headers => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) {
      continue
    }
    for (const one of Array.isArray(value) ? value : [value]) {
      headers.append(name, one)
    }
  }
  return headers
}

const answer = async (handlers: AuthHandlers, incoming: IncomingMessage): Promise<Response> => {
  const method = incoming.method ?? 'GET'
  const headers = headersOf(incoming.headers)
  // Built from the `Host` header, as a server builds it: the handlers only ever read the path and the query.
  const url = new URL(incoming.url ?? '/', `http://${headers.get('host') ?? '127.0.0.1'}`)

  const route = routeOf(handlers, url.pathname)
  if (route === undefined) {
    return new Response(`No route at ${url.pathname}\n`, { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }

  // No body is read: all four handlers are `GET` by the package's contract, and every request the suite sends is a
  // navigation. An adapter that carries a body belongs with the consumer-side adapter of #814, behind a test.
  return await route(new Request(url, { method, headers }))
}

/**
 * The four handlers on `127.0.0.1` at a free port.
 *
 * `getSetCookie()` is what carries the callback's two cookies — the session it installs and the state it takes back —
 * through as repeated headers; `Headers.get('set-cookie')` would fold them into one value no browser would split
 * correctly.
 */
export const startAppServer = async (handlers: AuthHandlers): Promise<AppServer> => {
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const response = await answer(handlers, incoming)
      const headers: Record<string, string | string[]> = {}
      response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') {
          headers[name] = value
        }
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length > 0) {
        headers['set-cookie'] = cookies
      }
      outgoing.writeHead(response.status, headers)
      outgoing.end(new Uint8Array(await response.arrayBuffer()))
    })().catch((failure: unknown) => {
      // A handler or the adapter itself threw, which is the unhandled failure a 500 is for. Answering it keeps the
      // socket from being left open: unanswered, the test would block until its 120 s timeout and report that
      // timeout instead of the stack.
      if (!outgoing.headersSent) {
        outgoing.writeHead(500, { 'Content-Type': 'text/plain' })
      }
      outgoing.end(`The test HTTP adapter failed: ${failure instanceof Error ? (failure.stack ?? failure.message) : String(failure)}\n`)
    })
  })

  const port = await new Promise<number>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        throw new Error('A TCP server listening on a port has an address carrying one.')
      }
      resolve(address.port)
    })
  })

  const close = async (): Promise<void> => {
    // Keep-alive connections the suite's `fetch` left open would hold the close open until they timed out.
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close(failure => (failure === undefined ? resolve() : reject(failure)))
    })
  }

  return { baseUrl: `http://127.0.0.1:${port}`, close }
}
