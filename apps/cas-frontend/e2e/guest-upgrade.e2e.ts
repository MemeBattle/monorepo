import type { Page } from '@playwright/test'

import { authorizationRequest, GUEST_CLIENT_ID, mintGuest, redirectToClient } from './authorization'
import { expect, test, uniqueName } from './fixtures'

const UPGRADE_SUBTITLE =
  'Игровой прогресс останется с вами: гостевой аккаунт станет постоянным. Придумайте имя, остальное сделает браузер. Пароля не будет.'

/** The account the browser is signed in to now, as CAS says it: the guest's `sub` and a full account after the upgrade. */
const expectUpgraded = async (page: Page, sub: string) => {
  const me = await page.request.get('/api/me')
  expect(me.status()).toBe(200)
  expect(await me.json()).toMatchObject({ accountId: sub, accountType: 'full' })
}

/** The dashboard of a full account with exactly one passkey. */
const expectFullDashboard = async (page: Page, displayName: string) => {
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
  await expect(page.getByText('Аккаунт', { exact: true })).toBeVisible()
  await expect(page.getByText('Гостевой аккаунт')).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(1)
}

// The button is what these scenarios press; the sign-in screen's autofill offer is not involved.
test.use({ autofill: false })

test('a guest with a hint creates the account and returns to the application', async ({ page, context, request, authenticatorId: _attached }) => {
  const guest = await mintGuest(request)
  const { path, state } = authorizationRequest({ clientId: GUEST_CLIENT_ID, idTokenHint: guest.idToken })

  await page.goto(path)

  // CAS sent the guest to create-account, and the gate kept it there instead of forwarding it back.
  await expect(page).toHaveURL(url => url.pathname === '/create-account')
  const returnTo = new URL(page.url()).searchParams.get('return_to') ?? ''
  expect(returnTo.startsWith('/oidc/authorize?')).toBe(true)
  const forwarded = new URLSearchParams(returnTo.slice(returnTo.indexOf('?')))
  expect(forwarded.get('state')).toBe(state)
  expect(forwarded.has('id_token_hint')).toBe(false)
  await expect(page.getByText(UPGRADE_SUBTITLE)).toBeVisible()

  const displayName = uniqueName('guest')
  await page.getByLabel('Имя').fill(displayName)
  const redirected = redirectToClient(page)
  await page.getByRole('button', { name: 'Создать пасскей' }).click()

  const callback = await redirected
  expect(callback.code).toBeTruthy()
  expect(callback.state).toBe(state)

  // The redirect URI does not resolve and its error page would cut a navigation of this tab short: the dashboard is
  // opened in another tab of the same browser.
  const dashboard = await context.newPage()
  await dashboard.goto('/')
  await expectFullDashboard(dashboard, displayName)
  await expectUpgraded(dashboard, guest.sub)
})

test('a guest who abandoned the upgrade finishes it from the dashboard', async ({ page, request, authenticatorId: _attached }) => {
  const guest = await mintGuest(request)
  const { path } = authorizationRequest({ clientId: GUEST_CLIENT_ID, idTokenHint: guest.idToken })
  await page.goto(path)
  await expect(page).toHaveURL(url => url.pathname === '/create-account')

  await page.goto('/')

  await expect(page.getByText('Гостевой аккаунт')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Пасскеи' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Выйти' })).toHaveCount(0)
  // Hiding is presentation: the backend refuses the list under the guest's session.
  expect((await page.request.get('/api/passkeys')).status()).toBe(401)

  await page.getByRole('link', { name: 'Создать аккаунт' }).click()
  await expect(page).toHaveURL('/create-account')
  await expect(page.getByText(UPGRADE_SUBTITLE)).toBeVisible()
  const displayName = uniqueName('guest')
  await page.getByLabel('Имя').fill(displayName)
  await page.getByRole('button', { name: 'Создать пасскей' }).click()

  await expect(page).toHaveURL('/')
  await expectFullDashboard(page, displayName)
  await expectUpgraded(page, guest.sub)
})
