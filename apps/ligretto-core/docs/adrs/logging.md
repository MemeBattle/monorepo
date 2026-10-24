---
title: Logging
description: >-
  One structured JSON line per request (method, path without query, status, duration, request id) and structured
  lines for errors, all through a Logger port whose only production adapter writes to the console. No pino, no
  request bodies, no cookies or tokens in any log line.
read_when:
  - logging anything from a use case, an adapter or a handler
  - debugging a request across the service and CAS
  - adding a runtime and deciding where its logs go
---

# Logging

## Context

The previous service configured pino and logged nothing per request; pino itself loads `worker_threads`, which
Workers do not provide. Both target runtimes collect what is written to the console: Kubernetes from stdout,
Workers through observability. What is missing is correlation: the session store's locks and CAS's token rotation
produce failures that are only explainable next to the request that triggered them.

## Decision

- `src/core/ports/logger.ts` defines `Logger` with `debug`, `info`, `warn`, `error`, each taking a message and a
  flat object of fields, and `child(fields)` to bind fields such as the request id. The production adapter writes
  one JSON object per line to `console.log` / `console.error` and drops `debug` unless `LOG_LEVEL=debug`; a
  development adapter may pretty-print. Tests pass a recording logger.
- A middleware in `src/http` logs one line per request at `info` on completion: `method`, `path` (no query string),
  `status`, `durationMs`, `requestId`. The request id is `cf-ray` or `x-request-id` when a proxy supplied one,
  otherwise generated, and is returned in `x-request-id` so a client's report can be matched to a line.
- Errors reaching the error handler are logged at `error` with the request id, the stable error code when there is
  one, and the stack. Expected refusals (a 401, a 404, a 422) are not errors and are not logged beyond the
  request line.
- Never logged: request or response bodies, cookies, `Authorization` headers, tokens of any kind, the internal
  secret. A field whose name suggests a secret is dropped by the adapter.

## Consequences

- Log volume is one line per request plus errors; acceptable at this service's traffic, revisit if it is not.
- A use case that wants to log receives the `Logger` as a dependency, like any other port; it never imports a
  logger module.
- `LOG_LEVEL` is the only logging configuration; it exists for `debug` and nothing else.
