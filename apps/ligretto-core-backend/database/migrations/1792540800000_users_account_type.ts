import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `users.is_temporary` becomes `account_type`, and the row gains the profile snapshot CAS's ID token carries.
 *
 * The boolean said one thing — guest or not; `account_type` is the value CAS itself speaks, so a session's
 * snapshot can be written to the row unchanged. Only an explicit `true` was ever a guest: a full user created
 * through `firstOrCreate({ casId }, {})` left the column `NULL`, so `NULL` and `false` both become `full`.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  public async up() {
    this.schema.alterTable(this.tableName, table => {
      table.string('account_type').notNullable().defaultTo('full')
      table.string('display_name').nullable()
      table.string('avatar_url').nullable()
    })

    // The query builder rather than raw SQL: the functional suites migrate this chain on sqlite.
    this.defer(async db => {
      await db.from(this.tableName).where('is_temporary', true).update({ account_type: 'guest' })
    })

    this.schema.alterTable(this.tableName, table => {
      table.dropColumn('is_temporary')
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, table => {
      table.boolean('is_temporary').nullable()
    })

    this.defer(async db => {
      await db.from(this.tableName).where('account_type', 'guest').update({ is_temporary: true })
      await db.from(this.tableName).whereNot('account_type', 'guest').update({ is_temporary: false })
    })

    this.schema.alterTable(this.tableName, table => {
      table.dropColumn('account_type')
      table.dropColumn('display_name')
      table.dropColumn('avatar_url')
    })
  }
}
