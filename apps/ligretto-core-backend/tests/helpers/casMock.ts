import app from '@adonisjs/core/services/app'
import type { Services } from '#contracts/CasServices'

export const mockCasUser = {
  _id: 'cas-user-123',
  username: 'testuser',
  email: 'test@example.com',
}

export const mockTemporaryUser = {
  _id: 'tmp-user-456',
  username: 'tmp_testuser',
}

export const mockTemporaryToken = 'tmp-token-abc'

const defaultMock: Services = {
  getMe: async () => ({ success: true, data: { user: mockCasUser } }),
  getUsers: async () => ({ success: true, data: [mockCasUser] }),
  createTemporaryToken: async () => ({
    success: true,
    data: { temporaryUser: mockTemporaryUser, temporaryToken: mockTemporaryToken },
  }),
  verifyToken: async () => ({ success: true, data: {} }),
  login: async () => ({}),
  signUp: async () => ({}),
}

// Mutable active mock — reset per test
export const activeCasMock: Services = { ...defaultMock }

export function resetCasMock(overrides: Partial<Services> = {}) {
  Object.assign(activeCasMock, defaultMock, overrides)
}

export function bindCasMock() {
  app.container.bind('casServices', () => activeCasMock)
}
