import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The sign-ins in flight of `@memebattle/ligretto-auth`'s `SessionStore` port.
 *
 * `session_id` and `sub` snapshot the session that started the sign-in and deliberately carry no foreign key:
 * an upgrade revokes the guest's grants, so the initiating session is routinely deleted before the callback
 * arrives, and the snapshot is exactly what the callback's `sub` comparison still needs then.
 */
export default class extends BaseSchema {
  protected tableName = 'auth_requests'

  public async up() {
    this.schema.createTable(this.tableName, table => {
      table.string('state').primary()
      table.string('code_verifier').notNullable()
      table.string('nonce').notNullable()
      table.string('session_id').nullable()
      table.string('sub').nullable()
      // Indexed for the sweep, which selects its candidates by this column.
      table.bigint('expires_at').notNullable().index()
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
