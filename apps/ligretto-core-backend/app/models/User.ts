import type { DateTime } from 'luxon'
import lodash from 'lodash'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { User as CasUser, TemporaryUser as CasTemporaryUser } from '#contracts/CasServices'
import Round from '#models/Round'
import { type ManyToMany } from '@adonisjs/lucid/types/relations'

export default class User extends BaseModel {
  public static table = 'users'

  public static selfAssignPrimaryKey = true

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column({ isPrimary: true })
  public casId: string

  @column()
  public isTemporary: boolean

  public mergeWithCasUser(casUser: CasUser | CasTemporaryUser | undefined) {
    return { ...this.serialize(), ...lodash.omit(casUser, '_id') }
  }

  @manyToMany(() => Round, {
    pivotTable: 'round_users',
    pivotForeignKey: 'user_id',
  })
  public rounds: ManyToMany<typeof Round>
}
