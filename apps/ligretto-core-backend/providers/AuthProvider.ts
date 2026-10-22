/**
 * The four handlers of `@memebattle/ligretto-auth`, built once from this deployment's configuration and put in the
 * container for `AuthController` to delegate to.
 *
 * A singleton rather than a per-request binding: the CAS client carries the discovery cache, so rebuilding it per
 * request would refetch the metadata document on every `me`. It is still resolved lazily, so a functional test can
 * rebind `authHandlers` over a scripted client before the first request is made.
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type { AuthHandlers } from '@memebattle/ligretto-auth'
import { createAuthHandlers, createCasClient } from '@memebattle/ligretto-auth'
import { createPgSessionStore } from '#app/stores/PgSessionStore'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    authHandlers: AuthHandlers
  }
}

export default class AuthProvider {
  constructor(protected application: ApplicationService) {}

  public static needsApplication = true

  public async register() {
    this.application.container.singleton('authHandlers', async (): Promise<AuthHandlers> => {
      const Env = (await import('#start/env')).default

      return createAuthHandlers({
        client: createCasClient({
          issuer: Env.get('CAS_ISSUER'),
          clientId: Env.get('LIGRETTO_CLIENT_ID'),
          clientSecret: Env.get('LIGRETTO_CLIENT_SECRET'),
          redirectUri: Env.get('LIGRETTO_CORE_AUTH_REDIRECT_URI'),
          postLogoutRedirectUri: Env.get('LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI'),
        }),
        store: createPgSessionStore({ db: await this.application.container.make('lucid.db') }),
        transport: Env.get('LIGRETTO_CORE_AUTH_SESSION_TRANSPORT'),
        appUrl: Env.get('LIGRETTO_CORE_AUTH_APP_URL'),
      })
    })
  }
}
