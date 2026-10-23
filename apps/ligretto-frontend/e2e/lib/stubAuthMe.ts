import type { Page } from '@playwright/test'
import type { MeResponse } from '@memebattle/ligretto-auth/contract'

/**
 * Answers `GET /api/auth/me` as `@memebattle/ligretto-auth` shapes the answer for a guest session, for the suites that
 * need no backend. It answers the auth gate, it does not bypass it. Every call answers the same `sub`, so a refresh
 * never looks like another identity.
 */
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
