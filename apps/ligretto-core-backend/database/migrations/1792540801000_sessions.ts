import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The sessions of `@memebattle/ligretto-auth`'s `SessionStore` port, and the rows its lock is taken on.
 *
 * Times are bigint epoch milliseconds — the representation the port speaks — so nothing round-trips through a
 * timezone on the way in or out.
 *
 * `session_locks` is a table of its own rather than the `sessions` row itself, because the port's lock has to
 * work for an id whose session does not exist: a writer deciding whether to recreate one takes the lock too,
 * and a row lock cannot be taken on a row that is not there.
 */
export default class extends BaseSchema {
  public async up() {
    this.schema.createTable('sessions', table => {
      table.string('id').primary()
      // The account id, stable across a guest upgrade; the users row is upserted before the session in the
      // same transaction, so the reference always holds.
      table.string('sub').notNullable().references('users.cas_id').index()
      table.string('account_type').notNullable()
      table.string('display_name').nullable()
      table.string('avatar_url').nullable()
      table.text('refresh_token').notNullable()
      table.text('access_token').notNullable()
      table.text('id_token').notNullable()
      table.bigint('access_token_expires_at').notNullable()
      // Indexed for the sweep, which selects its candidates by this column.
      table.bigint('grant_ends_at').notNullable().index()
      // The port's `createdAt`: when this grant began, so `grant_ends_at` is always 30 days past it. Not named
      // `created_at`, which is Lucid's own timestamp convention — its schema codegen reads a column of that name
      // as a `DateTime` whatever its type, and would keep regenerating a wrong `database/schema.ts`.
      table.bigint('grant_started_at').notNullable()
    })

    this.schema.createTable('session_locks', table => {
      table.string('id').primary()
    })
  }

  public async down() {
    this.schema.dropTable('session_locks')
    this.schema.dropTable('sessions')
  }
}
