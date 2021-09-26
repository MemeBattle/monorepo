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
    SuccessGetUsers,
    ErrorGetUsers,
    GetUsersPayload,
    SuccessCreateTemporaryToken,
    ErrorCreateTemporaryToken,
    User,
    TemporaryUser,
  } from '@memebattle/cas-services'

  export type Login = (credentials: LoginCredentials) => Promise<SuccessLogin | ErrorLogin>

  declare const login: Login

  export type SignUp = (credentials: SignUpCredentials) => Promise<SuccessSignUp | ErrorSignUp>

  declare const signUp: SignUp

  export type VerifyToken = (token: string) => Promise<VerifyTokenSuccess | VerifyTokenError>

  declare const verifyToken: VerifyToken

  export type GetMe = (payload: GetMePayload) => Promise<ErrorGetMe | SuccessGetMe>

  declare const getMe: GetMe

  export type GetUsers = (payload?: GetUsersPayload) => Promise<SuccessGetUsers | ErrorGetUsers>

  declare const getUsers: GetUsers

  export type CreateTemporaryToken = () => Promise<SuccessCreateTemporaryToken | ErrorCreateTemporaryToken>

  declare const createTemporaryToken: CreateTemporaryToken

  export type Services = {
    login: Login
    signUp: SignUp
    verifyToken: VerifyToken
    getMe: GetMe
    getUsers: GetUsers
    createTemporaryToken: CreateTemporaryToken
  }

  export { login, signUp, verifyToken, getMe, getUsers, createTemporaryToken, User, TemporaryUser }
}
