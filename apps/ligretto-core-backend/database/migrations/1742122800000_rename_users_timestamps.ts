import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  public async up() {
    // users table
    this.schema.table('users', table => {
      table.renameColumn('casId', 'cas_id')
      table.renameColumn('isTemporary', 'is_temporary')
    })

    // games table
    this.schema.table('games', table => {
      table.renameColumn('createdAt', 'created_at')
      table.renameColumn('updatedAt', 'updated_at')
    })

    // rounds table
    this.schema.table('rounds', table => {
      table.renameColumn('createdAt', 'created_at')
      table.renameColumn('updatedAt', 'updated_at')
      table.renameColumn('gameId', 'game_id')
    })

    // round_users table
    this.schema.table('round_users', table => {
      table.renameColumn('roundId', 'round_id')
      table.renameColumn('userId', 'user_id')
      table.renameColumn('createdAt', 'created_at')
      table.renameColumn('updatedAt', 'updated_at')
    })
  }

  public async down() {
    // users table
    this.schema.table('users', table => {
      table.renameColumn('cas_id', 'casId')
      table.renameColumn('is_temporary', 'isTemporary')
    })

    // games table
    this.schema.table('games', table => {
      table.renameColumn('created_at', 'createdAt')
      table.renameColumn('updated_at', 'updatedAt')
    })

    // rounds table
    this.schema.table('rounds', table => {
      table.renameColumn('created_at', 'createdAt')
      table.renameColumn('updated_at', 'updatedAt')
      table.renameColumn('game_id', 'gameId')
    })

    // round_users table
    this.schema.table('round_users', table => {
      table.renameColumn('round_id', 'roundId')
      table.renameColumn('user_id', 'userId')
      table.renameColumn('created_at', 'createdAt')
      table.renameColumn('updated_at', 'updatedAt')
    })
  }
}
