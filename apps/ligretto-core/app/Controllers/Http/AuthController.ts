import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { login, signUp } from '@ioc:CasServices'
import LoginValidator from '../../Validators/LoginValidator'
import SignUpValidator from '../../Validators/SignUpValidator'

export default class AuthController {
  async login({ request }: HttpContextContract) {
    const data = await request.validate(LoginValidator)
    const loginResult = await login(data)
    return loginResult
  }

  async signUp({ request }: HttpContextContract) {
    const data = await request.validate(SignUpValidator)
    const signUpResult = await signUp({ username: data.email, email: data.email, password: data.password })
    return signUpResult
  }
}
