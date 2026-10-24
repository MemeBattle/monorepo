// Demonstration for #834: adds a column that the same change already reads, which schema-previous must reject.
import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table users add column locale text`.execute(db)
}
