import CasServices from '@ioc:CasServices'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class CasAuth {
  public async handle({ request, response }: HttpContextContract, next: () => Promise<void>) {
    const token = request.header('Authorization')
    if (!token) {
      return response.forbidden({ error: 'Add Header: "Authorization" with CAS token' })
    }

    const data = await CasServices.verifyToken(token)
    if (data.success) {
      request.userCasId = data.data._id
    } else {
      return response.forbidden({ error: data.error })
    }
    await next()
  }
}
