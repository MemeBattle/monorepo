import { DateTime } from 'luxon'
import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export default class User extends BaseModel {
  public static table = 'users'

  public static selfAssignPrimaryKey = true

  public static connection = 'pg'

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column({ columnName: 'casId', isPrimary: true })
  public casId: string

  @column({ columnName: 'isTemporary' })
  public isTemporary: boolean
}
