import { createBaseRequest } from './request'
import {
  createLoginService,
  createSignUpService,
  createHealthService,
  createGetMeService,
  createGetUsersService,
  createCreateTemporaryTokenService,
} from './services'
import { createJWTServices } from './jwt'
import { CreateCasServices } from './types'

export const createCasServices = ({
  casURI,
  partnerId,
  publicKey,
  successLogger,
  errorLogger,
}: CreateCasServices) => {
  const baseRequest = createBaseRequest({ casURI, errorLogger, successLogger })

  const loginService = createLoginService(baseRequest)
  const healthService = createHealthService(baseRequest)

  const signUpService = createSignUpService(baseRequest, partnerId)

  const getMeService = createGetMeService(baseRequest)

  const getUsersService = createGetUsersService(baseRequest)

  const { verifyToken } = createJWTServices({ publicKey })

  const createTemporaryTokenService = createCreateTemporaryTokenService(baseRequest)

  return {
    loginService,
    signUpService,
    verifyToken,
    healthService,
    getMeService,
    getUsersService,
    createTemporaryTokenService,
  }
}
