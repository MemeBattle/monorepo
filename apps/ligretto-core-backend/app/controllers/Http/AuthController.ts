import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import UserModel from '#models/User'
import { getMeValidator } from '#validators/GetMeValidator'

export default class AuthController {
  async me({ request, response }: HttpContext) {
    const { token } = await getMeValidator.validate(request.all())
    const casServices = await app.container.make('casServices')
    if (token) {
      const casGetMeResult = await casServices.getMe({ token })
      if (casGetMeResult.success) {
        const user = await UserModel.firstOrCreate({ casId: casGetMeResult.data.user._id }, {})
        return { user: user.mergeWithCasUser(casGetMeResult.data.user), token }
      }
      if (casGetMeResult.error.errorCode !== 403) {
        return response.status(casGetMeResult.error.errorCode).json(casGetMeResult.error)
      }
    }
    const temporaryResult = await casServices.createTemporaryToken()
    if (temporaryResult.success) {
      const user = await UserModel.create({ casId: temporaryResult.data.temporaryUser._id, isTemporary: true })

      return { user: user.mergeWithCasUser(temporaryResult.data.temporaryUser), token: temporaryResult.data.temporaryToken }
    }
    return response.status(temporaryResult.error.errorCode).json(temporaryResult.error)
  }
}
