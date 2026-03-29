import type { User as CasUser } from '#contracts/CasServices'
import app from '@adonisjs/core/services/app'
import UserModel from '#models/User'
import { usersListValidator } from '#validators/UsersListValidator'
import { ensureArray } from '#helpers/ensureArray'
import type { HttpContext } from '@adonisjs/core/http'

export default class UsersController {
  public async index(ctx: HttpContext) {
    const rawQs = ctx.request.qs()
    const normalizedQs = { ...rawQs, ids: ensureArray(rawQs.ids) }
    const { ids } = await usersListValidator.validate(normalizedQs)
    const casServices = await app.container.make('casServices')
    const [casUsersResponse, users] = await Promise.all([casServices.getUsers({ ids }), UserModel.query().whereIn('casId', ids)])
    if (!casUsersResponse.success) {
      return ctx.response.status(casUsersResponse.error.errorCode).json(casUsersResponse.error)
    }
    return ctx.response.json(this.mergeCasUsersAndUsers(users, casUsersResponse.data))
  }

  private mergeCasUsersAndUsers(users: UserModel[], casUsers: CasUser[]) {
    const normalizedCasUsers: Record<string, CasUser> = casUsers.reduce((acc, casUser) => ({ ...acc, [casUser._id]: casUser }), {})

    return users.map(user => user.mergeWithCasUser(normalizedCasUsers[user.casId]))
  }
}
