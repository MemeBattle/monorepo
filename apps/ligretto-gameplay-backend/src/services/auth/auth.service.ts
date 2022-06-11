import { injectable } from 'inversify'
import type { LoginCredentials, SignUpCredentials } from '@memebattle/cas-services'
import { createCasServices } from '@memebattle/cas-services'
import { CAS_URL, PARTNER_ID, PUBLIC_KEY } from '../../config'

@injectable()
export class AuthService {
  private casServices = createCasServices({ casURI: CAS_URL, partnerId: PARTNER_ID, publicKey: PUBLIC_KEY })

  public async loginService(credentials: LoginCredentials) {
    try {
      const response = await this.casServices.loginService(credentials)
      if (response.success) {
        return response.data
      } else {
        return null
      }
    } catch (e) {
      console.error(e)
      return null
    }
  }

  public async signUpService(credentials: SignUpCredentials) {
    try {
      const response = await this.casServices.signUpService(credentials)
      if (response.success) {
        return response.data
      } else {
        return null
      }
    } catch (e) {
      console.error(e)
      return null
    }
  }

  public async verifyTokenService(token: string) {
    try {
      const data = await this.casServices.verifyToken(token)
      if (data.success) {
        return { userId: data.data._id }
      } else {
        return null
      }
    } catch (e) {
      console.error(e)
      return null
    }
  }
}
