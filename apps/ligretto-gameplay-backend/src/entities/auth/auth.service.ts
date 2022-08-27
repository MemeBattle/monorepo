import { injectable } from 'inversify'
import type { LoginCredentials, SignUpCredentials, SuccessLoginData, SuccessSignUpData } from '@memebattle/cas-services'
import { createCasServices } from '@memebattle/cas-services'
import { CAS_URL, CAS_PARTNER_ID, PUBLIC_KEY } from '../../config'

@injectable()
export class AuthService {
  public loginService: (credentials: LoginCredentials) => Promise<SuccessLoginData | null>
  public signUpService: (credentials: SignUpCredentials) => Promise<SuccessSignUpData | null>
  public verifyTokenService: (token: string) => Promise<{ userId: string } | null>

  constructor() {
    const { signUpService, loginService, verifyToken } = createCasServices({ casURI: CAS_URL, partnerId: CAS_PARTNER_ID, publicKey: PUBLIC_KEY })

    this.loginService = async (credentials: LoginCredentials) => {
      try {
        const response = await loginService(credentials)
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

    this.signUpService = async (credentials: SignUpCredentials) => {
      try {
        const response = await signUpService(credentials)
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

    this.verifyTokenService = async (token: string) => {
      try {
        const data = await verifyToken(token)
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
}
