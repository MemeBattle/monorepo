import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

export const registrationOptions = (registrationId: string) => ({
  registrationId,
  ccr: {
    publicKey: {
      challenge: 'Y2hhbGxlbmdl',
      rp: { name: 'MemeBattle', id: 'localhost' },
      // UUID 0191e2a4-5b6c-7d8e-9fa0-b1c2d3e4f506, usable as a guest upgrade handle too.
      user: { id: 'AZHipFtsfY6foLHC0-T1Bg', name: 'Ada', displayName: 'Ada' },
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
