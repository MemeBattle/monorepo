import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FileMigrationProvider, Migrator } from 'kysely/migration'

type MigratorProps = ConstructorParameters<typeof Migrator>[0]

const migrationFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

/** Applies every migration of the package with the provider `pnpm migrate` uses; throws what the result set reports. */
export const migrate = async (db: MigratorProps['db']): Promise<void> => {
  const migrator = new Migrator({ db, provider: new FileMigrationProvider({ fs, path, migrationFolder }) })
  const { error } = await migrator.migrateToLatest()
  if (error !== undefined) {
    throw error
  }
}
