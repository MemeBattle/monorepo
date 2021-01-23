import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Users extends BaseSchema {
  protected tableName = 'users'

  public async up() {
    this.schema.createTable(this.tableName, table => {
      table.increments('id').primary()
      table.timestamps(true)
      table.string('casId').unique().notNullable()
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
