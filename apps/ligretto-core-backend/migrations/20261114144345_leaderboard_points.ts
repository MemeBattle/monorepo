// The leaderboard points, aggregated on write by the save-round transaction
// (docs/adrs/leaderboard-points-aggregated-on-write.md).
// Immutable once on master (docs/MIGRATIONS.md): a mistake gets a new migration, never an edit of this file.
// Forward-only, so there is no `down`. The Migrator runs it in one transaction, so nothing here is `CONCURRENTLY`.
import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // `day` is the Europe/Berlin date of the round's `created_at`. `points` is `bigint` because it is a running sum of
  // `integer` scores.
  await sql`
    create table user_daily_points (
      user_id text not null references users (cas_id),
      day date not null,
      points bigint not null,
      primary key (user_id, day)
    )
  `.execute(db)

  await sql`create index user_daily_points_day_idx on user_daily_points (day)`.execute(db)

  await sql`
    create table user_totals (
      user_id text primary key references users (cas_id),
      points bigint not null
    )
  `.execute(db)
}
