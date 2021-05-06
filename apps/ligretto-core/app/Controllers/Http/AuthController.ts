import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { getMe } from '@ioc:CasServices'
import UserModel from '../../Models/User'
import GetMeValidator from '../../Validators/GetMeValidator'

export default class AuthController {
  async me({ request, response }: HttpContextContract) {
    const data = await request.validate(GetMeValidator)
    const casGetMeResult = await getMe(data)
    if (casGetMeResult.success) {
      const user = await UserModel.firstOrCreate({ casId: casGetMeResult.data.user._id }, {})
      return { ...casGetMeResult.data, profile: user }
    }
    return response.status(casGetMeResult.error.errorCode).json(casGetMeResult.error)
  }
}
