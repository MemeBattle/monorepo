import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class RoundUsers extends BaseSchema {
  protected tableName = 'round_users'

  public async up() {
    this.schema.createTable(this.tableName, table => {
      table.increments('id')

      table.uuid('roundId').references('rounds.id')
      table.string('userId').references('users.casId')
      table.unique(['roundId', 'userId'])

      table.integer('score')

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
