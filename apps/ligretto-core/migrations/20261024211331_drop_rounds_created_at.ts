// Demonstration for #834: drops a column without the contract marker, which check-migrations.sh must reject.
import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table rounds drop column created_at`.execute(db)
}
