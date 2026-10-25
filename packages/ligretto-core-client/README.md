# @memebattle/ligretto-core-client

The generated clients of `apps/ligretto-core-backend`, the only description of its API a consumer uses. kubb
generates one function per operation, named by its `operationId`, and the models of each document. The transport in
`src/client.ts` is this package's own, specified by
`apps/ligretto-core-backend/docs/adrs/api-contract-openapi-and-client-package.md`.

## Entries

| Import                                      | Document                | Consumer                  |
| ------------------------------------------- | ----------------------- | ------------------------- |
| `@memebattle/ligretto-core-client`          | `openapi.json`          | ligretto-frontend         |
| `@memebattle/ligretto-core-client/internal` | `openapi.internal.json` | ligretto-gameplay-backend |

Both entries export `getHealth`. A consumer that imports both aliases one of them.

## Making a client

There is no default base URL. Every call takes a `client` made with `createClient`, and the types require it: a call
without one does not compile.

```ts
import { createClient, saveRound } from '@memebattle/ligretto-core-client/internal'

const core = createClient({
  baseUrl: 'https://ligretto-core.internal',
  headers: { authorization: `Bearer ${process.env.LIGRETTO_INTERNAL_API_TOKEN}` },
})

const result = await saveRound({ client: core, path: { id: gameId }, body: { roundId, results } })
```

| Option        | What it does                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `baseUrl`     | Prefixed to every path, trailing slashes ignored. `''` gives same-origin relative URLs.           |
| `fetch`       | The `fetch` to send with. The global one by default.                                              |
| `headers`     | Sent with every request. A call's `headers` override them by name, in any letter case.            |
| `credentials` | Forwarded to `fetch`, such as `include` for a browser that sends the session cookie cross-origin. |

A call also takes `headers` and an `AbortSignal` as `signal`. Query arrays go on the wire as repeated keys
(`?ids=a&ids=b`). No redirect is followed.

## Results

An operation never throws on a status. It resolves to one of five kinds:

| `kind`       | When                                                                                       | Carries                         |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------------- |
| `success`    | A 2xx the document declares                                                                | `status`, `headers`, `data`     |
| `error`      | A 4xx or 5xx the document declares, with a JSON object body                                | `status`, `headers`, `error`    |
| `redirect`   | Any 3xx; `status` 0 for a browser's `opaqueredirect`                                       | `status`, `headers`, `location` |
| `unexpected` | An undeclared status, such as `500 internal_error`, or a body that does not fit the status | `status`, `headers`, `body`     |
| `transport`  | No usable response: `fetch` rejected, the signal aborted, the body could not be read       | `cause`                         |

`error` holds the whole body, typed per status, so code-specific fields reach the caller:

```ts
switch (result.kind) {
  case 'success':
    return result.data.gameResults
  case 'error':
    if (result.status === 422) {
      // `result.error.playerIds` is `string[]`
      throw new UnknownPlayers(result.error.playerIds)
    }
    throw new RoundRejected(result.error.error)
  case 'redirect':
  case 'unexpected':
  case 'transport':
    throw new CoreUnavailable(result)
}
```

## Regenerating

After a route changes in `apps/ligretto-core-backend`, regenerate its documents, then this client, and commit both:

```sh
pnpm --filter @memebattle/ligretto-core-backend openapi:generate
pnpm --filter @memebattle/ligretto-core-client generate:api
```

`generate:api` runs kubb into `src/generated/public` and `src/generated/internal`. Then
`scripts/require-client-option.mjs` removes the `= {}` default kubb prints for an operation's `options`, so `client`
stays required. Last, `scripts/generate-declared-statuses.mjs` writes `src/generated/declared-statuses.ts`, the map the
transport reads to tell a declared answer from an unexpected one. `ligretto-core-client-pr.yml` regenerates the
documents and the client and fails when the commit differs.

## Contract tests

`test/contract/*.spec.ts` call every generated operation against the real apps of ligretto-core. They run over PGlite
through the `./contract-harness` export of `@memebattle/ligretto-core-backend`, with a custom `fetch` and no network.
Every body is validated against the committed document. When a file ends, it fails unless every declared
`(operation, status, error code)` was produced by some case, so a run filtered with `-t` fails by design.

```sh
pnpm --filter @memebattle/ligretto-core-client test:ci
```
