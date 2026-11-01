# Socket.IO engines

The official `socket.io` server runs unmodified on two runtimes. What differs is the engine that hands it connections:

- on Node, the standard `engine.io` server, attached to the HTTP server;
- in a Cloudflare Durable Object, `WorkersEngine`, connected through `io.bind(engine)`, which speaks Engine.IO 4 over
  WebSockets.

Application handlers import neither engine and never detect the runtime, and the gameplay message format
(`socket.emit('message', { type, payload })`) is the same on both.

## Selecting an engine

`SocketEngine` (`src/socket-engine/socket-engine.ts`) is the seam: `attachTo(io)`. `createSocketServer(container, options)`
in `src/create-socket-server.ts` creates the `Server`, takes `IOC_TYPES.SocketEngine` and `IOC_TYPES.WebSocketHandler`
from the container and connects them. It loads in either runtime.

The runtime entry binds `IOC_TYPES.SocketEngine`. `createIOC()` has no default, so a container cannot silently run the
wrong engine. `src/socket-io-server.ts` binds `NodeSocketEngine`, a Worker binds a `WorkersEngine`:

```ts
const engine = new WorkersEngine({ pingInterval, pingTimeout, maxHttpBufferSize })
container.bind<SocketEngine>(IOC_TYPES.SocketEngine).toConstantValue(engine)
const io = createSocketServer(container, { serveClient: false, connectionStateRecovery })
// in the Durable Object's fetch:
return engine.handleRequest(request)
```

Everything specific to Cloudflare lives in `src/socket-engine/workers/`. `test/transport/worker/` is a complete host.

## What a host must do

- Set the `nodejs_compat` flag and a compatibility date of 2026-08-04 or later: `socket.io` needs the Node built-ins,
  and `WorkersEngine` relies on `Buffer` and `node:events`.
- Pass `serveClient: false`: its default resolves client files on disk.
- Create the `Server` inside the Durable Object, not at module scope, because the Workers global scope may not start
  timers.
- Give the engine options to `WorkersEngine`, not to `Server`: only `attach` passes them to an engine, and `bind` does
  not.
- Have clients set `transports: ['websocket']`. `ligretto-frontend` connects with default transports today, which the
  migration to Workers has to change.

## Supported

With the same behaviour as the standard engine, which `test/transport` verifies on both:

- `socket.handshake` with `auth`, `headers`, `query`, `url`, `address` (from `cf-connecting-ip`) and `secure`; middleware
  refusal with error `data`; `socket.data`.
- Events, acknowledgements, binary payloads, rooms, broadcasts with sender exclusion.
- Disconnect order and reasons: `client namespace disconnect`, `server namespace disconnect`, `server shutting down`,
  `transport close`, `transport error`, `ping timeout`, `parse error`, `forced close`.
- Independent connections for several tabs of one user, heartbeat in both directions, reconnection.
- Connection state recovery, with `skipMiddlewares` either way.
- Refusals with `engine.io`'s codes and bodies, as a 400, and the `connection_error` event: unknown transport (0),
  `sid` (1), a method other than GET (2), no upgrade (3), Engine.IO other than 4 (5).
- Option names and defaults: `pingInterval` 25 000, `pingTimeout` 20 000, `maxHttpBufferSize` 1e6.

Malformed input is handled as `engine.io` handles it. An unknown packet type or an empty frame closes with `parse error`,
a ping from the client with `transport error`, garbage above Engine.IO raises `error` on the socket and closes with
`forced close`, and `close` and `noop` packets are ignored. A frame above `maxHttpBufferSize` bytes closes with 1009 and
`transport error`.

## Limitations

- **WebSocket only.** There are no polling sessions, so a polling request gets a 400 with code 0 and `upgrades` is empty.
- **Engine.IO 4 only, and a subset of the options.** No compression, cookies, `allowRequest`, `engine.use()`, `headers`
  events, `initialPacket` or `forceBase64`: binary always travels as binary frames. There is no origin check; Node's
  `cors` option never applied to WebSocket either.
- **One `Server` per Durable Object.** There is no adapter between objects, so a room spans one object.
- **All state is in memory, recovery included.** Eviction, a code update or a crash loses sessions and missed packets,
  and clients then reconnect as new sockets.
- **No WebSocket Hibernation.** Socket.IO state and the heartbeat timers are in memory, so the engine uses `accept()`. An
  object with clients stays in memory and bills duration. Cloudflare documents that pending timers delay eviction, and
  `SessionAwareAdapter`'s 60 s interval is never cleared, so an empty object with recovery on may stay resident: the
  deployment task must check this before relying on idle eviction.
- **Reauthorization gates the connection, not the replay.** With `skipMiddlewares: false` the official server restores
  rooms and writes missed packets before it runs middleware, on either engine, so a client refused on recovery has
  already received them on the wire. Its listeners do not fire, since the client buffers until CONNECT. The session and
  that buffer both survive the refusal, so a later successful connect on the same `Socket` object delivers those events
  twice. Middleware cannot be relied on to withhold missed events from a revoked client. The engine adds no authorization
  of its own, and the contract pins this behaviour.
- **No write buffer or backpressure.** `send` is synchronous, so `volatile` never discards a packet, and the `drain`,
  `flush` and `packetCreate` events and the callback of `conn.write` do not exist. A failed send closes the connection
  at once with `transport error`.
- **`maxHttpBufferSize` is enforced by the engine,** in UTF-8 bytes, because the runtime does not limit frames to it.

## Decisions

- The engine lives in this app, not in a package: it has one consumer, and moving it later is a rename.
- A Durable Object owns one Socket.IO server, with accepted, not hibernated, WebSockets.
- The standard engine is the reference. `WorkersEngine` mirrors its reasons, refusal codes and option names, and the
  shared contract checks that it does.
- `WorkersConnection` separates construction from `start()`, and `WorkersEngine.openConnection` does its bookkeeping
  first: `send` throws synchronously in workerd, so a failed `open` must find the connection registered, and Socket.IO
  hears only of a connection that is still open.
- Cloudflare types are module imports, so the package keeps one TypeScript program and no ambient Workers globals.
- The local suite goes through the Wrangler CLI, not the Miniflare API, whose current version rejects its documented
  options.

## Transport contract tests

```
pnpm --filter @memebattle/ligretto-gameplay-backend test:transport
```

Prerequisites: the Node and pnpm versions the root `package.json` pins and `pnpm install`, which fetches `workerd`. No
Cloudflare account, token, deployed resource, Docker, CAS or core backend. CI runs the same command in the `transport`
job of `ligretto-gameplay-backend-pr.yml`.

`test/transport/global-setup.ts` starts `wrangler dev --local` on free ports and stops its whole process group, also when
a test fails, on Ctrl-C and on SIGTERM. Its output goes to `ligretto-transport-workerd-<port>.log` in the system
temporary directory. `transport-contract.spec.ts` runs every test on both engines, with real `socket.io-client`
instances and a Durable Object instance of its own per test, and `workers-engine.spec.ts` covers what Node deliberately
does differently. Test middleware stands in for the auth contract.
