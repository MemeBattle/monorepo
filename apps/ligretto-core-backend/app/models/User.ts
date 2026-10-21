import type { DateTime } from 'luxon'
import lodash from 'lodash'
import { BaseModel, column, computed, manyToMany } from '@adonisjs/lucid/orm'
import type { AccountType } from '@memebattle/ligretto-auth'
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

  /** The account type CAS itself speaks, written straight from a session's profile snapshot. */
  @column()
  public accountType: AccountType

  @column()
  public displayName: string | null

  @column()
  public avatarUrl: string | null

  /**
   * The field the serialized API has always carried. It stays until the frontend moves to `accountType` (#816);
   * only the column it used to come from is gone.
   */
  @computed()
  public get isTemporary(): boolean {
    return this.accountType === 'guest'
  }

  public mergeWithCasUser(casUser: CasUser | CasTemporaryUser | undefined) {
    return { ...this.serialize(), ...lodash.omit(casUser, '_id') }
  }

  @manyToMany(() => Round, {
    pivotTable: 'round_users',
    pivotForeignKey: 'user_id',
  })
  public rounds: ManyToMany<typeof Round>
}
