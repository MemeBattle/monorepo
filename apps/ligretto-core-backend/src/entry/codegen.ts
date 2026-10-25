// Regenerates src/adapters/pg/schema.generated.ts from the database DATABASE_URL names (`pnpm db:codegen`), after
// `pnpm migrate` against the same database; `pnpm db:codegen --verify` compares instead of writing and fails on a
// difference. DATABASE_URL comes from the shared development loader, the one the migrate entry uses, and is handed
// to kysely-codegen literally, so the generator's own env-file handling never runs.
import { fileURLToPath } from 'node:url'

import { Cli } from 'kysely-codegen'

import { createConsoleLogger } from '../adapters/console-logger.ts'
import { loadDatabaseConfig, loadLoggingConfig } from '../core/config.ts'
import { loadDevelopmentEnv } from './env.ts'

loadDevelopmentEnv()

const { url } = loadDatabaseConfig(process.env)
const logger = createConsoleLogger({ level: loadLoggingConfig(process.env).level })
const verify = process.argv.includes('--verify')

try {
  await new Cli().generate({
    url,
    dialect: 'postgres',
    outFile: fileURLToPath(new URL('../adapters/pg/schema.generated.ts', import.meta.url)),
    verify,
    logLevel: 'info',
  })
} catch (error) {
  logger.error('codegen_failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
}
