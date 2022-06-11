import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class Rounds extends BaseSchema {
  protected tableName = 'rounds'

  public async up() {
    this.schema.createTable(this.tableName, table => {
      table.uuid('id').primary()
      table.uuid('gameId').references('games.id').onDelete('CASCADE')

      /**
       * Uses timestamptz for PostgreSQL and DATETIME2 for MSSQL
       */
      table.timestamp('createdAt', { useTz: true })
      table.timestamp('updatedAt', { useTz: true })
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
