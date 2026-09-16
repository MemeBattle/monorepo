export { getMe, logout } from './api'
export type { Me } from './api'
export {
  isAuthenticatorUnsupported,
  isCeremonyCancelled,
  isPasskeyAlreadyRegistered,
  isWrongOrigin,
  registerWithPasskey,
  signInWithPasskey,
  signInWithPasskeyFromAutofill,
} from './ceremonies'
export type { Registered, SignedIn } from './ceremonies'
