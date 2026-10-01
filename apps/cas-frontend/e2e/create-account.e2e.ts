import { expect, test, uniqueName } from './fixtures'

const lastPasskeyNote = 'Единственный пасскей нельзя удалить: сначала добавьте второй.'

test('a new user goes from the front door to the dashboard with one passkey', async ({ page, authenticators, authenticatorId }) => {
  const displayName = uniqueName('new')

  // No session: the gate sends the browser to sign-in.
  await page.goto('/')
  await expect(page).toHaveURL('/sign-in')
  await expect(page.getByRole('heading', { name: 'Вход в MemeBattle' })).toBeVisible()

  await page.getByRole('link', { name: 'Создать' }).click()
  await expect(page).toHaveURL('/create-account')
  await page.getByLabel('Имя').fill(displayName)
  await page.getByRole('button', { name: 'Создать пасскей' }).click()

  // The finish set the session cookie and the dashboard's loader read it.
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible()

  // One passkey with the server's default name, never used yet, and the nudge above the sections.
  await expect(page.getByRole('heading', { name: 'Добавьте второй пасскей' })).toBeVisible()
  const rows = page.getByRole('listitem')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Passkey')
  await expect(rows.first()).toContainText('Не использовался')
  await expect(page.getByRole('button', { name: 'Удалить «Passkey»' })).toBeDisabled()
  await expect(page.getByText(lastPasskeyNote)).toBeVisible()

  // The authenticator holds the discoverable credential the ceremony made, scoped to the relying party.
  const credentials = await authenticators.credentials(authenticatorId)
  expect(credentials).toHaveLength(1)
  expect(credentials[0]).toMatchObject({ rpId: 'localhost', isResidentCredential: true })

  // A signed-in browser has nothing to do on the auth screens.
  await page.goto('/sign-in')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
})

test('a name the server rejects stays in the field with the reason under it', async ({ page, authenticatorId: _attached }) => {
  await page.goto('/create-account')
  // A zero-width space is invisible: the client cannot tell, the server answers `invalid_display_name`.
  const withInvisible = `${uniqueName('bad')}​`
  await page.getByLabel('Имя').fill(withInvisible)
  await page.getByRole('button', { name: 'Создать пасскей' }).click()

  await expect(page.getByText('Имя содержит недопустимые символы.')).toBeVisible()
  await expect(page.getByLabel('Имя')).toHaveValue(withInvisible)
  await expect(page).toHaveURL('/create-account')
})
