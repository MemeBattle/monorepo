import { getUsers } from '@ioc:CasServices'
import UsersListValidator from 'App/Validators/UsersListValidator'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { validator } from '@ioc:Adonis/Core/Validator'

export default class UsersController {
  public async index(ctx: HttpContextContract) {
    const { schema } = new UsersListValidator(ctx)

    const { ids } = await validator.validate({ schema, data: ctx.request.qs() })

    return getUsers({ ids })
  }
}
