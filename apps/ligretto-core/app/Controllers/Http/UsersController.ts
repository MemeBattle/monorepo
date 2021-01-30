import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import UpdateUserValidator from '../../Validators/UpdateUserValidator'

export default class UsersController {
  public async index() {
    return [{ id: 1, username: 'themezv' }]
  }

  public async update({ request }: HttpContextContract) {
    const data = await request.validate(UpdateUserValidator)
    console.log('update', data)
    return {}
  }
}
