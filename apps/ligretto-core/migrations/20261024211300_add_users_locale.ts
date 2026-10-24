// Demonstration for #834: adds a nullable column, which keeps both releases working. Immutable once on master.
import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table users add column locale text`.execute(db)
}
