import { test as base, expect } from '@playwright/test'
import type { CDPSession, Page } from '@playwright/test'

export { expect }

/**
 * What every virtual authenticator here is: the platform authenticator of a
 * device (`internal`), able to hold discoverable credentials with user
 * verification, which is what CAS asks for, and confirming every prompt on
 * its own (`isUserVerified`, `automaticPresenceSimulation`), so a ceremony
 * runs through without anyone touching anything. That includes the
 * conditional one: with the virtual environment on and its UI off, Chromium
 * answers the sign-in screen's autofill offer with the discoverable
 * credential as soon as it has one, the pick a user would make from the list.
 */
const platformAuthenticator = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
} as const

/**
 * Chromium's virtual authenticators over CDP (the `WebAuthn` domain), for
 * one page. Adding one is plugging a device in; removing one is taking it
 * away with every passkey it holds. A second device for the same account is
 * a swap, not an addition: a registration with two authenticators attached
 * fails as `InvalidStateError` as soon as either holds an excluded
 * credential, the same as it would with a real one.
 */
export class VirtualAuthenticators {
  constructor(private readonly cdp: CDPSession) {}

  /** Answers the new authenticator's id. */
  async add(): Promise<string> {
    const { authenticatorId } = await this.cdp.send('WebAuthn.addVirtualAuthenticator', { options: platformAuthenticator })
    return authenticatorId
  }

  async remove(authenticatorId: string): Promise<void> {
    await this.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
  }

  /** The credentials an authenticator holds: one per account created or passkey added with it. */
  async credentials(authenticatorId: string) {
    const { credentials } = await this.cdp.send('WebAuthn.getCredentials', { authenticatorId })
    return credentials
  }
}

/** Different on every call, so tests never see each other's accounts. Well under the 64-character cap of a display name. */
export const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/**
 * The first flow of DESIGN.md as a step: the create-account screen, the
 * name, the ceremony on the page's authenticator, and the dashboard with
 * that name in the header.
 */
export const createAccount = async (page: Page, displayName: string): Promise<void> => {
  await page.goto('/create-account')
  await page.getByLabel('Имя').fill(displayName)
  await page.getByRole('button', { name: 'Создать пасскей' }).click()
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
}

interface Options {
  /**
   * Whether the browser offers passkeys through autofill. `false` is a browser
   * without conditional mediation (`isConditionalMediationAvailable` answers
   * `false`), the one the sign-in button is the fallback for; the sign-in
   * screen then makes no offer that the virtual authenticator would accept
   * before the button is pressed.
   */
  autofill: boolean
}

interface Fixtures {
  /** The page's authenticators; one is attached before the test starts. */
  authenticators: VirtualAuthenticators
  /** The id of the authenticator attached before the test starts. */
  authenticatorId: string
  /** A fresh account with one passkey, signed in on the dashboard. */
  account: { displayName: string }
}

// Playwright calls the second argument of a fixture `use`; here it is `provide`, so that the React hooks lint rule
// does not take it for React's `use`.
export const test = base.extend<Options & Fixtures>({
  autofill: [true, { option: true }],
  page: async ({ page, autofill }, provide) => {
    if (!autofill) {
      await page.addInitScript(() => {
        PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false)
      })
    }
    await provide(page)
  },
  authenticators: async ({ page }, provide) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await provide(new VirtualAuthenticators(cdp))
    await cdp.detach()
  },
  authenticatorId: async ({ authenticators }, provide) => {
    await provide(await authenticators.add())
  },
  account: async ({ page, authenticatorId: _attached }, provide) => {
    const displayName = uniqueName('e2e')
    await createAccount(page, displayName)
    await provide({ displayName })
  },
})
