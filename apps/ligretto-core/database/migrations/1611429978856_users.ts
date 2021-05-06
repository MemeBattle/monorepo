import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Users extends BaseSchema {
  protected tableName = 'users'

  public static selfAssignPrimaryKey = true

  public async up() {
    this.schema.createTable(this.tableName, table => {
      table.timestamps(true)
      table.string('casId').primary()
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
