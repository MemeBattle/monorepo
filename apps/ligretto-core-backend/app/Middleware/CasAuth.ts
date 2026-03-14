import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class CasAuth {
  public async handle({ request, response }: HttpContext, next: NextFn) {
    const token = request.header('Authorization')
    if (!token) {
      return response.forbidden({ error: 'Add Header: "Authorization" with CAS token' })
    }

    const casServices = await app.container.make('casServices')
    const data = await casServices.verifyToken(token)
    if (data.success) {
      request.userCasId = data.data._id
    } else {
      return response.forbidden({ error: data.error })
    }
    await next()
  }
}
