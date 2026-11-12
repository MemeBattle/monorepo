export { getMe, logout, updateEmail } from './api'
export type { Me, UpdateEmailErrorCode } from './api'
export {
  isAuthenticatorUnsupported,
  isCeremonyCancelled,
  isNotTheGuest,
  isPasskeyAlreadyRegistered,
  isWrongOrigin,
  registerWithPasskey,
  signInWithPasskey,
  signInWithPasskeyFromAutofill,
} from './ceremonies'
export type { RegisterWithPasskeyErrorCode, SignInWithPasskeyErrorCode } from './ceremonies'
