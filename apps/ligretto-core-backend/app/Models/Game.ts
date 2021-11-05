import { DateTime } from 'luxon'
import { HasMany } from '@ioc:Adonis/Lucid/Orm'
import { BaseModel, column, hasMany, beforeCreate } from '@ioc:Adonis/Lucid/Orm'
import Round from './Round'
import { randomUUID } from 'node:crypto'

export default class Game extends BaseModel {
  public static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  public id: string

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @hasMany(() => Round)
  public rounds: HasMany<typeof Round>

  @beforeCreate()
  public static assignUuid(user: Game) {
    user.id = randomUUID()
  }
}
