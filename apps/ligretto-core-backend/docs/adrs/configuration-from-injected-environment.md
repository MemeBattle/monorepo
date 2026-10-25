---
title: Configuration from an injected environment
description: Configuration is a value parsed once by a zod schema from a plain object the entry hands in — `process.env` on Node, the bindings object on Workers. No module reads `process.env` itself.
read_when:
  - adding or renaming an environment variable
  - needing a setting inside a use case or an adapter
  - writing an entry point or a test harness
---

# Configuration from an injected environment

## Context

Cloudflare Workers deliver configuration as a bindings object passed to the handler; `process.env` exists under
`nodejs_compat` but only mirrors text bindings, and a Hyperdrive binding is an object, not a string. Node delivers
`process.env` plus `.env` files in development. A module that reads `process.env` at import time works on one of
them and silently misreads the other. The previous service used the framework's env loader, which read `.env` from disk at boot.

## Decision

- `src/core/config.ts` exports the zod schema in sections (`database`, `auth`, `internalApi`, `http`, `logging`)
  and `loadConfig(source: Record<string, unknown>): Config` plus one loader per section, so `entry/migrate.ts`
  and `entry/sweep.ts` parse the database section alone and do not demand the auth settings they never use.
  Parsing fails loudly, listing every missing or malformed variable at once; a service with a bad configuration
  does not start.
- Entries are the only readers of the environment. `entry/node.ts` loads `.env` files with `dotenv-flow` in
  development and passes `process.env`; `entry/worker.ts` passes the `env` bindings. Both call `loadConfig` and pass
  the resulting `Config` (or the slice a component needs) down by argument.
- Variable names are unchanged from the previous service where the meaning is unchanged (`LIGRETTO_CORE_*`,
  `CAS_ISSUER`, `LIGRETTO_CAS_CLIENT_*`), so existing manifests, compose files and CI keep working.
- The database is configured by one `DATABASE_URL` on Node. On Workers the Hyperdrive binding supplies the
  connection string; the entry maps it onto the same `Config` field, so nothing below the entry knows the
  difference.
- Secrets that must accept two values during rotation (the internal API token) are declared as comma-separated
  lists in the schema and parsed into arrays there, once.

## Consequences

- A test builds a `Config` literal or calls `loadConfig` with an object; no test sets `process.env`.
- Adding a variable is one line in the schema and one line in each deployment manifest; forgetting the manifest
  fails at startup, not at first use.
- `process.env` access anywhere outside `src/entry` is a lint error, see `layering-and-runtime-neutrality.md`.

upd (2026-10-25): the previous service was deleted in #842 and this package took its name; the Context no longer
names its env loader.
