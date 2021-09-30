import { DateTime } from 'luxon'
import omit from 'lodash/omit'
import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'
import type { User as CasUser, TemporaryUser as CasTemporaryUser } from '@ioc:CasServices'

export default class User extends BaseModel {
  public static table = 'users'

  public static selfAssignPrimaryKey = true

  public static connection = 'pg'

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  public updatedAt: DateTime

  @column({ columnName: 'casId', isPrimary: true })
  public casId: string

  @column({ columnName: 'isTemporary' })
  public isTemporary: boolean

  public mergeWithCasUser(casUser: CasUser | CasTemporaryUser | undefined) {
    console.log('casUser', casUser)
    return { ...this.serialize(), ...omit(casUser, '_id') }
  }
}
