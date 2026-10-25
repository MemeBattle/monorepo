// The whole schema of docs/DESIGN.md § Data, created from scratch: nothing of the previous service's schema is kept.
// Immutable once on master (docs/MIGRATIONS.md): a mistake gets a new migration, never an edit of this file.
// Forward-only, so there is no `down`. The Migrator runs it in one transaction, so nothing here is `CONCURRENTLY`.
import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // The latest profile snapshot per CAS subject, for GET /api/users; written on every grant by the session store.
  await sql`
    create table users (
      cas_id text primary key,
      account_type text not null check (account_type in ('guest', 'full')),
      display_name text,
      avatar_url text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db)

  await sql`
    create table games (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now()
    )
  `.execute(db)

  // `id` is minted by the gameplay backend once per round, so it has no default.
  await sql`
    create table rounds (
      id uuid primary key,
      game_id uuid not null references games (id),
      created_at timestamptz not null default now()
    )
  `.execute(db)

  await sql`create index rounds_game_id_idx on rounds (game_id)`.execute(db)

  await sql`
    create table round_users (
      round_id uuid not null references rounds (id),
      user_id text not null references users (cas_id),
      score integer not null,
      created_at timestamptz not null default now(),
      primary key (round_id, user_id)
    )
  `.execute(db)

  // The `Session` of ligretto-auth's SessionStore port, column for column: each session carries its own profile
  // snapshot, which may differ from the latest one in `users` until the session refreshes. Epoch milliseconds are
  // `bigint`. No foreign key to `users`: a session survives whatever happens to that row.
  await sql`
    create table sessions (
      id text primary key,
      sub text not null,
      account_type text not null check (account_type in ('guest', 'full')),
      display_name text,
      avatar_url text,
      refresh_token text not null,
      access_token text not null,
      id_token text not null,
      access_token_expires_at bigint not null,
      grant_ends_at bigint not null,
      grant_started_at bigint not null
    )
  `.execute(db)

  await sql`create index sessions_grant_ends_at_idx on sessions (grant_ends_at)`.execute(db)

  // A pending sign-in (`PendingAuthorizationRequest`); `session_id` and `sub` are set when it upgrades a session.
  await sql`
    create table auth_requests (
      state text primary key,
      code_verifier text not null,
      nonce text not null,
      session_id text,
      sub text,
      expires_at bigint not null
    )
  `.execute(db)

  await sql`create index auth_requests_expires_at_idx on auth_requests (expires_at)`.execute(db)

  // The rows the session store locks (docs/adrs/session-store-locking.md).
  await sql`create table session_locks (id text primary key)`.execute(db)
}
