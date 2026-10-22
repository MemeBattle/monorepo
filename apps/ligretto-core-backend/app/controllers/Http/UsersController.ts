import UserModel from '#models/User'
import { usersListValidator } from '#validators/UsersListValidator'
import { ensureArray } from '#helpers/ensureArray'
import type { HttpContext } from '@adonisjs/core/http'

/** The answer's shape: these columns of the snapshot, and nothing else of the model. */
const PROFILE_FIELDS = ['casId', 'accountType', 'displayName', 'avatarUrl']

export default class UsersController {
  /**
   * The profiles of the ids asked for, from the `users` snapshot alone — no request to CAS: the session store
   * (`#app/stores/PgSessionStore`) writes the snapshot on every grant, so this route depends on no other service.
   *
   * An id with no row is absent from the answer: this is a lookup, not a claim that every id exists. A guest
   * carries `displayName: null`, since CAS releases no name for one, and `avatarUrl` is null for everybody until
   * CAS releases `picture`.
   */
  public async index(ctx: HttpContext) {
    const rawQs = ctx.request.qs()
    const normalizedQs = { ...rawQs, ids: ensureArray(rawQs.ids) }
    const { ids } = await usersListValidator.validate(normalizedQs)

    const users = await UserModel.query().whereIn('casId', ids)
    return ctx.response.json(users.map(user => user.serialize({ fields: { pick: PROFILE_FIELDS } })))
  }
}
