import { DateTime } from 'luxon'
import { BaseModel, column, ManyToMany, manyToMany } from '@ioc:Adonis/Lucid/Orm'
import User from './User'

export default class Round extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @manyToMany(() => User, {
    pivotTable: 'round_users',
    pivotColumns: ['score'],
    pivotTimestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  })
  public users: ManyToMany<typeof User>
}
