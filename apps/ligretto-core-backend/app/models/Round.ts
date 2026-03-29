import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany, belongsTo, beforeCreate } from '@adonisjs/lucid/orm'
import User from './User.js'
import Game from './Game.js'
import { randomUUID } from 'node:crypto'
import { type ManyToMany, type BelongsTo } from '@adonisjs/lucid/types/relations'

export default class Round extends BaseModel {
  public static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  public id: string

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public gameId: number

  @manyToMany(() => User, {
    pivotTable: 'round_users',
    pivotColumns: ['score'],
    relatedKey: 'casId',
    pivotRelatedForeignKey: 'user_id',
    pivotTimestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  })
  public users: ManyToMany<typeof User>

  @belongsTo(() => Game)
  public game: BelongsTo<typeof Game>

  @beforeCreate()
  public static assignUuid(user: Game) {
    user.id = randomUUID()
  }
}
