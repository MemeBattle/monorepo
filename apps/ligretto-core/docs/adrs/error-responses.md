---
title: Error responses
description: Every refusal is a declared status with a body `{ error: <stable code>, description? }` and code-specific fields; the codes are part of the contract. 500 is only the unhandled failure and is never produced on purpose; what is known gets a 4xx or a 503 with a code.
read_when:
  - adding a failure path to a use case or a route
  - choosing a status code or inventing an error code
  - mapping a use case's result to a response in `src/http`
---

# Error responses

## Context

The previous service threw `new Error('Game not found')` and let the framework turn it into a 500, and answered
validation failures in whatever shape the validator produced. Clients cannot branch on prose, and a 500 for a
known condition hides real failures among expected ones. `@memebattle/ligretto-auth` already answers every known
CAS failure as a 4xx or 503 with a stable `error` code (`AuthErrorResponse`); this service adopts the same shape
for everything it answers.

## Decision

- A use case does not throw for an expected outcome. It returns a discriminated result (`{ ok: true, value }` or
  `{ ok: false, error: 'game_not_found' }`), and `src/http` maps each error to a status and a body declared on
  the route. A throw means a bug or an outage.
- The body is `{ error: string, description?: string }` with optional code-specific fields (for example
  `unknown_players: { playerIds: string[] }`). `error` is a stable snake_case code that never changes meaning;
  `description` is for a developer and may change freely.
- Statuses: `400 validation_failed` for a request the schemas reject (with the issues under `issues`),
  `401` for a missing or invalid credential (`unauthorized` on the public API, `invalid_internal_token` on the
  internal one), `404` for a missing resource addressed by id, `422` for a well-formed request the rules refuse,
  `503` with a code for a dependency that is down (`cas_unavailable`, `database_unavailable`).
- `500` is produced by the error handler only, for an unhandled throw, with a generic body and the request id; it
  is never returned deliberately from a handler.
- Every code a route can answer is declared in that route's `responses`, so it is in the OpenAPI document and in
  the generated client's types (`api-contract-openapi-and-client-package.md`). An undeclared code cannot be
  returned: the compiler refuses it.
- Error codes are defined next to the code that produces them, in the module of the use case or the middleware,
  not in a central catalogue.

## Consequences

- A client switches on `error`, never on `description` or on the status alone.
- A new failure path is a schema change: it shows up in the document and the client, which is the review it needs.
- `/health` is the one route whose 503 has a different body (the check report); it is declared as such.
