import { DateTime } from 'luxon'
import { HasMany } from '@ioc:Adonis/Lucid/Orm'
import { BaseModel, column, hasMany } from '@ioc:Adonis/Lucid/Orm'
import Round from './Round'

export default class Game extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @hasMany(() => Round)
  public rounds: HasMany<typeof Round>
}
