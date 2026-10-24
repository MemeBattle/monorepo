---
title: Layering and runtime neutrality
description: Use cases live in `src/core` and depend on ports only; Hono exists only in `src/http`; Node and Cloudflare Workers are two thin entries over the same application factory. The boundaries are enforced by lint, not by convention.
read_when:
  - adding a module and deciding which directory it belongs to
  - importing anything from `node:*`, `hono`, `pg` or `cloudflare:*`
  - adding a runtime, an entry point or a scheduled job
  - wiring a dependency into the application
---

# Layering and runtime neutrality

## Context

The previous service was an AdonisJS application: the framework owned the container, the HTTP server, the ORM, the
configuration and the process. It could not run on Cloudflare Workers (a shared connection pool in a singleton, a
`node:http` server, a logger on `worker_threads`), and nothing in it could be tested or reused without booting the
framework. Two requirements replace it: the business rules must not depend on the HTTP framework, and the service
must run on Node.js and on Cloudflare Workers from the same source: Workers is the deployment target, Node the
runtime of development, CI and a possible return to Kubernetes. Neither may rot while the other is used.

## Decision

One package, five directories, each allowed a fixed set of imports:

| Directory      | Holds                                                                                                                        | May import                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core`     | use cases, domain types, ports (interfaces)                                                                                  | web-standard globals only (`Request`, `crypto`, `fetch`, `URL`); `zod` for the contract; nothing from `node:*`, `hono`, `pg`, `kysely`, `cloudflare:*` |
| `src/contract` | zod schemas of requests, responses and error bodies; the types derived from them                                             | `zod`, the schemas `@memebattle/ligretto-auth` exports                                                                                                 |
| `src/http`     | `createPublicApp(deps)` and `createInternalApp(deps)`: routes, validation, mapping of use-case results to responses, OpenAPI | `hono`, `@hono/zod-openapi`, `src/core`, `src/contract`                                                                                                |
| `src/adapters` | implementations of the ports: Postgres repositories and the session store over Kysely, the console logger, the clock         | `kysely`, `pg`, `src/core`                                                                                                                             |
| `src/entry`    | one file per way the code is started: `node.ts`, `worker.ts`, `migrate.ts`, `sweep.ts`                                       | everything, including `node:*`, `@hono/node-server`, `cloudflare:workers`                                                                              |

Rules:

- A use case is a function built from its dependencies: `createSaveRound({ games, users, clock })` returns
  `(gameId, results) => Promise<Result>`. It receives ports, never a Hono context, a request or a database handle.
- `src/http` contains no business rules. A handler validates (through the route's schemas), calls one use case, and
  maps its result to a status and a body. If a handler grows a branch that is not about HTTP, the branch belongs in
  `src/core`.
- There is no dependency-injection container. Each entry composes the adapters and passes them to the app factory
  by hand. A test composes fakes the same way.
- The boundaries are oxlint `no-restricted-imports` rules per directory. A violation fails `pnpm lint:check`;
  "we will be careful" is not a mechanism.
- Both entries are built and smoke-tested in CI on every change (`node` boots and answers `/health`; the Worker
  bundle builds and answers `/health` under `workerd`). An entry that only builds on a developer's machine does not
  exist.

A separate package for `src/core` was considered and rejected: it has one consumer. The directory boundary with
lint gives the same guarantee without a publish step; a package can be cut out later if a second consumer appears.

## Consequences

- Swapping Hono (or adding a second HTTP layer) touches `src/http` and the entries only.
- Every use case is unit-testable with fakes for its ports and no I/O.
- Anything Node-specific that a use case wants (a Buffer helper, `node:crypto` beyond the web subset) has to be
  expressed as a port and implemented in `src/adapters`, which is deliberate friction.
- The entries are the only place where "which runtime am I on" is a legitimate question.
- `configuration-from-injected-environment.md`, `database-access-with-kysely.md` and `logging.md` all exist because
  of this split: each describes one port and its adapters.
