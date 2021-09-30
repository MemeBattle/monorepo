import type { User as CasUser } from '@ioc:CasServices'
import { getUsers } from '@ioc:CasServices'
import UserModel from 'App/Models/User'
import UsersListValidator from 'App/Validators/UsersListValidator'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { validator } from '@ioc:Adonis/Core/Validator'

export default class UsersController {
  public async index(ctx: HttpContextContract) {
    const { schema } = new UsersListValidator(ctx)

    const { ids } = await validator.validate({ schema, data: ctx.request.qs() })
    const [casUsersResponse, users] = await Promise.all([getUsers({ ids }), UserModel.query().whereIn('casId', ids)])
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
