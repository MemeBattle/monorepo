import type { DateTime } from 'luxon'
import { BaseModel, column, computed, manyToMany } from '@adonisjs/lucid/orm'
import type { AccountType } from '@memebattle/ligretto-auth'
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

  /** The field the serialized API carries. It stays until the frontend moves to `accountType` (#816). */
  @computed()
  public get isTemporary(): boolean {
    return this.accountType === 'guest'
  }

  @manyToMany(() => Round, {
    pivotTable: 'round_users',
    pivotForeignKey: 'user_id',
  })
  public rounds: ManyToMany<typeof Round>
}
