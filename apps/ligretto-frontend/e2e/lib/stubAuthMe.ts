import type { Page } from '@playwright/test'
import type { MeResponse } from '@memebattle/ligretto-auth/contract'

export const stubAuthMe = (page: Page, overrides: Partial<MeResponse> = {}) =>
  page.route('**/api/auth/me', route =>
    route.fulfill({
      json: {
        user: { sub: 'e2e-guest', accountType: 'guest', name: null, avatarUrl: null },
        accessToken: 'e2e-access-token',
        expiresAt: Date.now() + 600_000,
        signedOut: false,
        ...overrides,
      } satisfies MeResponse,
    }),
  )
