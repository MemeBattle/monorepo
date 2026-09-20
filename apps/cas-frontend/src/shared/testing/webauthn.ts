import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

export const registrationOptions = (registrationId: string) => ({
  registrationId,
  ccr: {
    publicKey: {
      challenge: 'Y2hhbGxlbmdl',
      rp: { name: 'MemeBattle', id: 'localhost' },
      user: { id: 'YWRh', name: 'Ada', displayName: 'Ada' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60_000,
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    } satisfies PublicKeyCredentialCreationOptionsJSON,
  },
})
export const loginOptions = (loginId: string) => ({
  loginId,
  rcr: { publicKey: { challenge: 'Y2hhbGxlbmdl', timeout: 60_000, userVerification: 'required' } satisfies PublicKeyCredentialRequestOptionsJSON },
})
