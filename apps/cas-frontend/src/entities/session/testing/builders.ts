import type { Me, Registered } from '../index'

export const aMe = (overrides: Partial<Me> = {}): Me => ({
  accountId: 'acc',
  displayName: 'Ада',
  accountType: 'full',
  email: null,
  sessionExpiresAt: '2030-09-17T00:00:00Z',
  ...overrides,
})
export const aRegistration = (overrides: Partial<Registered> = {}): Registered => ({ accountId: 'acc', credentialId: 'cred', ...overrides })
