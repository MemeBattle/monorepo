import { DateTime } from 'luxon'
import { BaseModel, column, ManyToMany, manyToMany, BelongsTo, belongsTo } from '@ioc:Adonis/Lucid/Orm'
import User from './User'
import Game from './Game'

export default class Round extends BaseModel {
  @column({ isPrimary: true })
  public id: number

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
}
