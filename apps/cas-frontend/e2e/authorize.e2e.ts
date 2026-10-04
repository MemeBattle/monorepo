import type { Page } from '@playwright/test'

import { authorizationRequest, redirectToClient, returnTo } from './authorization'
import { expect, test, uniqueName } from './fixtures'

/**
 * A `return_to` that a browser can actually arrive at: a document CAS serves
 * on this origin. The client's redirect URI does not resolve, so Chromium
 * commits no history entry for it and Back from there proves nothing about
 * how the way out was taken; history is checked against this one instead.
 */
const FORWARDED = '/oidc/jwks.json?forwarded'

/**
 * Opens the authorization request as the application would. Without a
 * session CAS sends the browser to sign-in; CAS's own error page instead
 * means the client is missing from its database. `commit`, because the
 * sign-in screen may be gone (forwarded or signed in by autofill) before it
 * finishes loading.
 */
const openAuthorization = async (page: Page, path: string) => {
  const response = await page.goto(path, { waitUntil: 'commit' })
  expect(response?.url(), 'CAS did not send the browser to sign-in: is the e2e client registered? Run e2e/seed.sh').toContain('/sign-in?return_to=')
}

const signOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL('/sign-in')
}

test.describe('a browser without autofill', () => {
  test.use({ autofill: false })

  test('signs in with the button and returns to the application with a code', async ({ page, account: _account }) => {
    await signOut(page)
    const { path, state } = authorizationRequest()

    await openAuthorization(page, path)
    await expect(page).toHaveURL(`/sign-in${returnTo(path)}`)
    const redirected = redirectToClient(page)
    await page.getByRole('button', { name: 'Войти с пасскеем' }).click()

    const callback = await redirected
    expect(callback.code).toBeTruthy()
    expect(callback.state).toBe(state)
  })

  test('a new user creates an account and returns to the application with a code', async ({ page, authenticatorId: _attached }) => {
    const { path, state } = authorizationRequest()

    await openAuthorization(page, path)
    await page.getByRole('link', { name: 'Создать' }).click()
    await expect(page).toHaveURL(`/create-account${returnTo(path)}`)
    await page.getByLabel('Имя').fill(uniqueName('authorize'))
    const redirected = redirectToClient(page)
    await page.getByRole('button', { name: 'Создать пасскей' }).click()

    const callback = await redirected
    expect(callback.code).toBeTruthy()
    expect(callback.state).toBe(state)
  })

  test('a new user who came with return_to leaves no CAS screen behind', async ({ page, authenticatorId: _attached }) => {
    // The application's page: the first navigation from the initial blank page replaces it, so this one stands in.
    await page.goto('/oidc/jwks.json')
    const arrivals: string[] = []
    page.on('request', request => {
      if (request.url().endsWith(FORWARDED)) {
        arrivals.push(request.url())
      }
    })

    await page.goto(`/sign-in${returnTo(FORWARDED)}`)
    await page.getByRole('link', { name: 'Создать' }).click()
    await expect(page).toHaveURL(`/create-account${returnTo(FORWARDED)}`)
    await page.getByLabel('Имя').fill(uniqueName('return-to'))
    await page.getByRole('button', { name: 'Создать пасскей' }).click()
    await expect(page).toHaveURL(FORWARDED)

    // Sign-in, create account and the way out replaced one another: Back is the application's page again, and no
    // auth screen is left to forward a second time.
    await page.goBack()
    await expect(page).toHaveURL('/oidc/jwks.json')
    expect(arrivals).toHaveLength(1)
  })

  test('a return_to that leads off this origin is dropped and sign-in ends on the dashboard', async ({ page, account }) => {
    const offOrigin: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).hostname.endsWith('evil.example')) {
        offOrigin.push(request.url())
      }
    })

    for (const value of ['https://evil.example/', '//evil.example/', '/.//evil.example/']) {
      await signOut(page)
      await page.goto(`/sign-in${returnTo(value)}`)
      await page.getByRole('button', { name: 'Войти с пасскеем' }).click()

      await expect(page).toHaveURL('/')
      await expect(page.getByRole('heading', { name: account.displayName })).toBeVisible()
    }
    expect(offOrigin).toEqual([])
  })
})

test('a signed-in browser is forwarded at once to the application with a code', async ({ page, account: _account }) => {
  const { path, state } = authorizationRequest()

  const redirected = redirectToClient(page)
  await page.goto(`/sign-in${returnTo(path)}`, { waitUntil: 'commit' })

  const callback = await redirected
  expect(callback.code).toBeTruthy()
  expect(callback.state).toBe(state)
})

test('a signed-in browser forwarded by the gate leaves no sign-in entry behind', async ({ page, account: _account }) => {
  await page.goto(`/sign-in${returnTo(FORWARDED)}`, { waitUntil: 'commit' })
  await expect(page).toHaveURL(FORWARDED)

  // The gate left with `location.replace`: Back is the dashboard, not the sign-in gate forwarding again.
  await page.goBack()
  await expect(page).toHaveURL('/')
})

test('signs in from the autofill offer and returns to the application with a code', async ({ page, context, account: _account }) => {
  // Signed out without the logout button: the session cookie is simply gone, the passkey stays on the authenticator.
  await context.clearCookies()
  const { path, state } = authorizationRequest()

  const redirected = redirectToClient(page)
  await openAuthorization(page, path)

  const callback = await redirected
  expect(callback.code).toBeTruthy()
  expect(callback.state).toBe(state)
})
