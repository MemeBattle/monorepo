import { verify } from 'jsonwebtoken'
import { CreateJWTServices, VerifyTokenSuccess, VerifyTokenError } from '../types'

export const createJWTServices = ({ publicKey }: CreateJWTServices) => ({
  verifyToken(token: string): Promise<VerifyTokenSuccess | VerifyTokenError> {
    return new Promise(resolve => {
      verify(token, publicKey, { algorithms: ['RS256'] }, (err, decoded: { _id: string }) =>
        err ? resolve({ success: false, error: err }) : resolve({ success: true, data: decoded }),
      )
    })
  },
})
