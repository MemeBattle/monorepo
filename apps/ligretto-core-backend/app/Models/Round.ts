import { DateTime } from 'luxon'
import { BaseModel, column, ManyToMany, manyToMany, BelongsTo, belongsTo, beforeCreate } from '@ioc:Adonis/Lucid/Orm'
import User from './User'
import Game from './Game'
import { randomUUID } from 'node:crypto'

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
    pivotRelatedForeignKey: 'userId',
    pivotTimestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
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
