import type { Page } from '@playwright/test'

import { createAccount, expect, test, uniqueName } from './fixtures'

const signOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL('/sign-in')
  await expect(page.getByRole('heading', { name: 'Вход в MemeBattle' })).toBeVisible()
}

test.describe('a browser without autofill', () => {
  test.use({ autofill: false })

  test('signs out and back in with the button', async ({ page, account }) => {
    await signOut(page)

    // The session is gone: the dashboard is behind the gate again.
    await page.goto('/')
    await expect(page).toHaveURL('/sign-in')

    await page.getByRole('button', { name: 'Войти с пасскеем' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: account.displayName })).toBeVisible()
    // The sign-in was recorded on the passkey that made it.
    await expect(page.getByRole('listitem').first()).toContainText('Использован сегодня')
  })

  test('a device without a passkey ends with the cancelled alert and stays on sign-in', async ({
    page,
    authenticators,
    authenticatorId,
    account: _signedIn,
  }) => {
    await signOut(page)

    // Another device, holding nothing: the browser has no passkey to answer with and ends the ceremony as `NotAllowedError`.
    await authenticators.remove(authenticatorId)
    await authenticators.add()
    await page.getByRole('button', { name: 'Войти с пасскеем' }).click()

    await expect(page.getByText('Вход отменён')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Попробовать ещё раз' })).toBeVisible()
    await expect(page).toHaveURL('/sign-in')
  })
})

test('signs in from the autofill offer without pressing anything', async ({ page, authenticatorId: _attached }) => {
  // Every ceremony the page starts, by the mediation it asked for: the proof that it was the offer that signed in.
  const mediations: string[] = []
  await page.exposeFunction('recordMediation', (mediation: string) => mediations.push(mediation))
  await page.addInitScript(() => {
    const get = navigator.credentials.get.bind(navigator.credentials)
    navigator.credentials.get = options => {
      void (window as unknown as { recordMediation: (mediation: string) => void }).recordMediation(options?.mediation ?? 'none')
      return get(options)
    }
  })

  const displayName = uniqueName('autofill')
  await createAccount(page, displayName)
  // Not `signOut`: the sign-in screen is transient here, the virtual authenticator takes the offer as soon as it is
  // up, so the URL and the heading may be gone before they are looked for. The server's answer to the logout is
  // the proof that the session ended and what follows is a fresh sign-in.
  const loggedOut = page.waitForResponse(response => response.url().endsWith('/api/logout') && response.status() === 204)
  await page.getByRole('button', { name: 'Выйти' }).click()
  await loggedOut

  // Conditional mediation: the offer stands from the moment the screen is up, and the virtual authenticator takes it.
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
  await expect(page.getByRole('listitem').first()).toContainText('Использован сегодня')
  expect(mediations.length).toBeGreaterThan(0)
  expect(mediations).toEqual(mediations.map(() => 'conditional'))
})
