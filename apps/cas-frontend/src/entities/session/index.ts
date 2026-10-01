export { getMe, logout, updateEmail } from './api'
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
