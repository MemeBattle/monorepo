import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import type { VirtualAuthenticators } from './fixtures'

const lastPasskeyNote = 'Единственный пасскей нельзя удалить: сначала добавьте второй.'

const rename = async (page: Page, from: string, to: string) => {
  await page.getByRole('button', { name: `Переименовать «${from}»` }).click()
  const field = page.getByLabel('Название')
  await expect(field).toHaveValue(from)
  await field.fill(to)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('button', { name: `Переименовать «${to}»` })).toBeEnabled()
}

/**
 * The second device of DESIGN.md's recovery story: the first authenticator
 * goes, a fresh one comes, and the nudge's button registers a passkey on it.
 */
const addPasskeyFromAnotherDevice = async (page: Page, authenticators: VirtualAuthenticators, current: string) => {
  await authenticators.remove(current)
  const next = await authenticators.add()
  await page.getByRole('button', { name: 'Добавить пасскей' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(2)
  return next
}

test('the only passkey cannot be deleted', async ({ page, account: _signedIn }) => {
  await expect(page.getByRole('heading', { name: 'Добавьте второй пасскей' })).toBeVisible()
  const remove = page.getByRole('button', { name: 'Удалить «Passkey»' })
  await expect(remove).toBeDisabled()
  await expect(remove).toHaveAccessibleDescription(lastPasskeyNote)
  await expect(page.getByText(lastPasskeyNote)).toBeVisible()
  // Nothing to confirm: the sheet never opens.
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('renames a passkey and the name survives a reload', async ({ page, account: _signedIn }) => {
  await rename(page, 'Passkey', 'Мой ноутбук')
  const row = page.getByRole('listitem').first()
  await expect(row).toContainText('Мой ноутбук')
  await expect(row).not.toContainText('Passkey')

  await page.reload()
  await expect(page.getByRole('listitem').first()).toContainText('Мой ноутбук')
  await expect(page.getByRole('button', { name: 'Удалить «Мой ноутбук»' })).toBeDisabled()

  // "Отмена" keeps the name as it was.
  await page.getByRole('button', { name: 'Переименовать «Мой ноутбук»' }).click()
  await page.getByLabel('Название').fill('Черновик')
  await page.getByRole('button', { name: 'Отмена' }).click()
  await expect(page.getByRole('listitem').first()).toContainText('Мой ноутбук')
  await expect(page.getByLabel('Название')).toHaveCount(0)
})

test('adds a second passkey: the nudge goes and the first one becomes deletable', async ({
  page,
  authenticators,
  authenticatorId,
  account: _signedIn,
}) => {
  await rename(page, 'Passkey', 'Первый')

  // The same device again: its passkey is on the exclude list, and the browser refuses before the server is asked.
  await page.getByRole('button', { name: 'Добавить пасскей' }).click()
  await expect(page.getByText('На этом устройстве уже есть пасскей')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(1)

  const second = await addPasskeyFromAnotherDevice(page, authenticators, authenticatorId)

  await expect(page.getByRole('heading', { name: 'Добавьте второй пасскей' })).toHaveCount(0)
  await expect(page.getByText('На этом устройстве уже есть пасскей')).toHaveCount(0)
  await expect(page.getByText(lastPasskeyNote)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Удалить «Первый»' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Удалить «Passkey»' })).toBeEnabled()
  await expect(page.getByRole('listitem').nth(1)).toContainText('Не использовался')

  // The new passkey lives on the new device, scoped to the relying party.
  const credentials = await authenticators.credentials(second)
  expect(credentials).toHaveLength(1)
  expect(credentials[0]).toMatchObject({ rpId: 'localhost', isResidentCredential: true })
})

test('deletes a passkey through the sheet, and the guard comes back on the last one', async ({
  page,
  authenticators,
  authenticatorId,
  account: _signedIn,
}) => {
  await rename(page, 'Passkey', 'Первый')
  await addPasskeyFromAnotherDevice(page, authenticators, authenticatorId)

  // "Отмена" leaves the list as it is.
  await page.getByRole('button', { name: 'Удалить «Первый»' }).click()
  const sheet = page.getByRole('dialog', { name: 'Удалить пасскей «Первый»?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Отмена' })).toBeFocused()
  await sheet.getByRole('button', { name: 'Отмена' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // Escape too.
  await page.getByRole('button', { name: 'Удалить «Первый»' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Confirming takes the row away at once, before the server has answered; the reload waits for its answer, or it
  // would cut the request short and find both passkeys still there.
  const deleted = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/api/passkeys/'))
  await page.getByRole('button', { name: 'Удалить «Первый»' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('listitem').first()).toContainText('Passkey')
  expect((await deleted).status()).toBe(204)
  await page.reload()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('listitem').first()).toContainText('Passkey')

  // One passkey again: the nudge is back and the last one is guarded.
  await expect(page.getByRole('heading', { name: 'Добавьте второй пасскей' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Удалить «Passkey»' })).toBeDisabled()
  await expect(page.getByText(lastPasskeyNote)).toBeVisible()
})
