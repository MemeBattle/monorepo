import type { LoginCredentials, SignUpCredentials } from '@memebattle/cas-services'
import { createCasServices } from '@memebattle/cas-services'
import type { ApplicationContract } from '@ioc:Adonis/Core/Application'
import Logger from '@ioc:Adonis/Core/Logger'
import type { Services } from '@ioc:CasServices'

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
    const partnerId = Env.get('PARTNER_ID')
    const publicKey = Env.get('CAS_PUBLIC_KEY')
    const casURI = Env.get('CAS_URI')

    this.application.container.bind(
      'CasServices',
      (): Services => {
        const services = createCasServices({ partnerId, casURI, publicKey })
        const login = async (credentials: LoginCredentials) => {
          try {
            const result = await services.loginService(credentials)

            return result.data
          } catch (e) {
            Logger.error(e)
            throw Error(e)
          }
        }

        const signUp = async (credentials: SignUpCredentials) => {
          try {
            const result = await services.signUpService(credentials)

            return result.data
          } catch (e) {
            Logger.error(e)
            throw Error(e)
          }
        }

        const verifyToken = (token: string) => services.verifyToken(token)

        return { login, signUp, verifyToken }
      },
    )
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
