// Writes openapi.json and openapi.internal.json at the package root from the two app factories (`pnpm
// openapi:generate`); `pnpm openapi:generate --verify` compares instead of writing and fails on a difference. The
// documents are read from the apps' route registries, so no request is served and the dependencies are inert: each
// throws if anything ever calls it.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { createConsoleLogger } from '../adapters/console-logger'
import { systemClock } from '../adapters/system-clock'
import type { DatabaseProbe } from '../core/ports/database-probe'
import type { GamesRepository } from '../core/ports/games-repository'
import type { UsersRepository } from '../core/ports/users-repository'
import { createInternalApp } from '../http/internal-app'
import { internalApiDocument, publicApiDocument } from '../http/openapi'
import { createPublicApp } from '../http/public-app'

const inert = (name: string) => () => {
  throw new Error(`${name} is not available while generating the OpenAPI documents`)
}

const database: DatabaseProbe = { ping: inert('the database probe') }
const games: GamesRepository = { createGame: inert('the games repository'), withGame: inert('the games repository') }
const logger = createConsoleLogger({ level: 'info' })
const users: UsersRepository = { findBySubs: inert('the users repository') }
const auth = {
  me: inert('the auth handlers'),
  signIn: inert('the auth handlers'),
  callback: inert('the auth handlers'),
  logout: inert('the auth handlers'),
}
const deps = { logger, clock: systemClock, database }

const documents = [
  {
    file: 'openapi.json',
    document: publicApiDocument(createPublicApp({ ...deps, auth, users, verifyAccessToken: inert('the access-token verifier') })),
  },
  { file: 'openapi.internal.json', document: internalApiDocument(createInternalApp({ ...deps, games, internalTokens: [] })) },
]

const verify = process.argv.includes('--verify')

for (const { file, document } of documents) {
  const path = fileURLToPath(new URL(`../../${file}`, import.meta.url))
  const content = `${JSON.stringify(document, null, 2)}\n`
  if (!verify) {
    await writeFile(path, content)
    continue
  }
  const committed = await readFile(path, 'utf8').catch(() => undefined)
  if (committed !== content) {
    logger.error('openapi_out_of_date', { file, command: 'pnpm openapi:generate' })
    process.exitCode = 1
  }
}
