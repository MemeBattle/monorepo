import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class CasAuth {
  public async handle({}: HttpContextContract, next: () => Promise<void>) {
    console.log('CasAuth')
    await next()
  }
}
