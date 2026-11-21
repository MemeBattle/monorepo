import type { Passkey } from '../index'

export const aPasskey = (overrides: Partial<Passkey> = {}): Passkey => ({
  id: 'pk_1',
  name: 'Пасскей',
  createdAt: '2026-09-19T10:00:00Z',
  lastUsedAt: null,
  ...overrides,
})
