import { createCasServices } from '@memebattle/cas-services'
import type { ApplicationContract } from '@ioc:Adonis/Core/Application'
import type { Services } from '@ioc:CasServices'
import { readFile } from 'fs/promises'

/*
|--------------------------------------------------------------------------
| Provider
|--------------------------------------------------------------------------
|
| Your application is not ready when this file is loaded by the framework.
| Hence, the level imports relying on the IoC container will not work.
| You must import them inside the life-cycle methods defined inside
| the provider class.
|
| @example:
|
| public async ready () {
|   const Database = (await import('@ioc:Adonis/Lucid/Database')).default
|   const Event = (await import('@ioc:Adonis/Core/Event')).default
|   Event.on('db:query', Database.prettyPrint)
| }
|
*/
export default class CasServiceProvider {
  constructor(protected application: ApplicationContract) {
    this.application = application
  }

  public static needsApplication = true

  public async register() {
    const Env = (await import('@ioc:Adonis/Core/Env')).default
    const partnerId = Env.get('CAS_PARTNER_ID')
    const publicKeyPath = Env.get('LIGRETTO_CORE_CAS_PUBLIC_KEY_PATH')
    const casURI = Env.get('CAS_URL')
    const publicKey = Env.get('LIGRETTO_CORE_APP_MODE') === 'migrations' ? '' : (await readFile(publicKeyPath)).toString()

    this.application.container.bind('CasServices', (): Services => {
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
