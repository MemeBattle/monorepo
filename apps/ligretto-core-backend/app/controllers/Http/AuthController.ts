/**
 * The four routes of a sign-in, mounted 1:1 from `@memebattle/ligretto-auth`: what they answer is the package's
 * (`packages/ligretto-auth/src/handlers.ts`), and all this controller does is carry Adonis's request and response
 * across (`#helpers/webHandler`).
 */

import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { handleWith } from '#helpers/webHandler'

export default class AuthController {
  async me(ctx: HttpContext) {
    const handlers = await app.container.make('authHandlers')
    await handleWith(ctx, handlers.me)
  }

  async signIn(ctx: HttpContext) {
    const handlers = await app.container.make('authHandlers')
    await handleWith(ctx, handlers.signIn)
  }

  async callback(ctx: HttpContext) {
    const handlers = await app.container.make('authHandlers')
    await handleWith(ctx, handlers.callback)
  }

  async logout(ctx: HttpContext) {
    const handlers = await app.container.make('authHandlers')
    await handleWith(ctx, handlers.logout)
  }
}
