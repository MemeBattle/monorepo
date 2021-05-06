declare module '@ioc:CasServices' {
  import type {
    LoginCredentials,
    SignUpCredentials,
    SuccessLogin,
    ErrorLogin,
    ErrorSignUp,
    SuccessSignUp,
    VerifyTokenSuccess,
    VerifyTokenError,
    GetMePayload,
    SuccessGetMe,
    ErrorGetMe,
  } from '@memebattle/cas-services'

  export type Login = (credentials: LoginCredentials) => Promise<SuccessLogin | ErrorLogin>

  declare const login: Login

  export type SignUp = (credentials: SignUpCredentials) => Promise<SuccessSignUp | ErrorSignUp>

  declare const signUp: SignUp

  export type VerifyToken = (token: string) => Promise<VerifyTokenSuccess | VerifyTokenError>

  declare const verifyToken: VerifyToken


  export type GetMe = (payload: GetMePayload) => Promise<ErrorGetMe, SuccessGetMe>

  declare const getMe: GetMe

  export type Services = {
    login: Login
    signUp: SignUp
    verifyToken: VerifyToken
    getMe: GetMe
  }

  export { login, signUp, verifyToken, getMe }
}
