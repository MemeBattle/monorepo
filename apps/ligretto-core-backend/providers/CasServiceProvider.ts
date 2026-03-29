import { createCasServices } from '@memebattle/cas-services'
import type { Services } from '#contracts/CasServices'
import { readFile } from 'fs/promises'
import type { ApplicationService } from '@adonisjs/core/types'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    casServices: Services
  }
}

export default class CasServiceProvider {
  constructor(protected application: ApplicationService) {}

  public static needsApplication = true

  public async register() {
    const Env = (await import('#start/env')).default
    const partnerId = Env.get('CAS_PARTNER_ID')
    const publicKeyPath = Env.get('LIGRETTO_CORE_CAS_PUBLIC_KEY_PATH')
    const casURI = Env.get('CAS_URL')
    const publicKey = Env.get('LIGRETTO_CORE_APP_MODE') === 'migrations' ? '' : (await readFile(publicKeyPath)).toString()

    this.application.container.bind('casServices', (): Services => {
      const services = createCasServices({ partnerId, casURI, publicKey })
      const login = services.loginService

      const signUp = services.signUpService

      const verifyToken = services.verifyToken

      const getMe = services.getMeService

      const getUsers = services.getUsersService

      const createTemporaryToken = services.createTemporaryTokenService

      return { login, signUp, verifyToken, getMe, getUsers, createTemporaryToken }
    })
  }

  public async boot() {
    // All bindings are ready, feel free to use them
  }

  public async ready() {
    // App is ready
  }

  public async shutdown() {
    // Cleanup, since app is going down
  }
}
