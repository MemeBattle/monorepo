import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { getMe, createTemporaryToken } from '@ioc:CasServices'
import UserModel from 'App/Models/User'
import GetMeValidator from 'App/Validators/GetMeValidator'

export default class AuthController {
  async me({ request, response }: HttpContextContract) {
    const { token } = await request.validate(GetMeValidator)
    if (token) {
      const casGetMeResult = await getMe({ token })
      if (casGetMeResult.success) {
        const profile = await UserModel.firstOrCreate({ casId: casGetMeResult.data.user._id }, {})
        return { ...casGetMeResult.data, profile, token }
      }
      return response.status(casGetMeResult.error.errorCode).json(casGetMeResult.error)
    }
    const temporaryResult = await createTemporaryToken()
    if (temporaryResult.success) {
      const profile = await UserModel.create({ casId: temporaryResult.data.temporaryUser._id, isTemporary: true })

      return { user: temporaryResult.data.temporaryUser, token: temporaryResult.data.temporaryToken, profile }
    }
    return response.status(temporaryResult.error.errorCode).json(temporaryResult.error)
  }
}
