/**
 * The surface of `node:http` that `./server.ts` uses, and nothing more.
 *
 * The package adds no `@types/node` (a recorded decision in the README): `src/` is runtime-agnostic, and typing the
 * whole Node API here would make an accidental `import 'node:fs'` in `src/` type-check. This declaration lives in the
 * `tests` project of `tsconfig.tests.json`, which `tsconfig.json` does not include, so `src/` never sees it. If the
 * adapter grows, so does this file — never the dependency.
 */

declare module 'node:http' {
  interface IncomingMessage extends AsyncIterable<Uint8Array> {
    readonly method?: string
    readonly url?: string
    readonly headers: Record<string, string | string[] | undefined>
  }

  interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string | string[]>): void
    end(body?: Uint8Array): void
  }

  interface Server {
    listen(port: number, host: string, listener: () => void): void
    address(): { port: number } | string | null
    close(listener: (failure?: Error) => void): void
    closeAllConnections(): void
  }

  function createServer(handler: (request: IncomingMessage, response: ServerResponse) => void): Server
}
