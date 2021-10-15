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
        const user = await UserModel.firstOrCreate({ casId: casGetMeResult.data.user._id }, {})
        return { user: user.mergeWithCasUser(casGetMeResult.data.user), token }
      }
      if (casGetMeResult.error.errorCode !== 403) {
        return response.status(casGetMeResult.error.errorCode).json(casGetMeResult.error)
      }
    }
    const temporaryResult = await createTemporaryToken()
    if (temporaryResult.success) {
      const user = await UserModel.create({ casId: temporaryResult.data.temporaryUser._id, isTemporary: true })

      return { user: user.mergeWithCasUser(temporaryResult.data.temporaryUser), token: temporaryResult.data.temporaryToken }
    }
    return response.status(temporaryResult.error.errorCode).json(temporaryResult.error)
  }
}
