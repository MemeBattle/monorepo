import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, beforeCreate } from '@adonisjs/lucid/orm'
import Round from './Round.js'
import { randomUUID } from 'node:crypto'
import { type HasMany } from '@adonisjs/lucid/types/relations'

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
