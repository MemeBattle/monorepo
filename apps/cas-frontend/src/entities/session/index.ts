export { getMe, logout, updateEmail } from './api'
export type { GetMeErrorCode, Me, UpdateEmailErrorCode } from './api'
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
export type { RegisterWithPasskeyErrorCode, Registered, SignInWithPasskeyErrorCode, SignedIn, Upgrading } from './ceremonies'
