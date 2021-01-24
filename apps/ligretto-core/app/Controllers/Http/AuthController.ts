import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { login, signUp } from '@ioc:CasServices'
import Logger from '@ioc:Adonis/Core/Logger'
import UserModel from '../../Models/User'
import LoginValidator from '../../Validators/LoginValidator'
import SignUpValidator from '../../Validators/SignUpValidator'

export default class AuthController {
  async login({ request, response }: HttpContextContract) {
    const data = await request.validate(LoginValidator)
    const loginResult = await login(data)
    if(loginResult.success) {
      const user = await UserModel.firstOrCreate({casId: loginResult.data.user._id}, {})
      return { ...loginResult.data, profile: user }
    }
    return response.badRequest(loginResult)
  }

  async signUp({ request, response }: HttpContextContract) {
    const data = await request.validate(SignUpValidator)
    const signUpResult = await signUp({ username: data.email, email: data.email, password: data.password })
    if(signUpResult.success) {
      const user = await UserModel.firstOrCreate({casId: signUpResult.data._id}, { casId: signUpResult.data._id })
      return {user: signUpResult.data, profile: user}
    } else {
      Logger.info(signUpResult.error.errorMessage)
      return response.status(signUpResult.error.errorCode).json(signUpResult.error)
    }
  }
}
