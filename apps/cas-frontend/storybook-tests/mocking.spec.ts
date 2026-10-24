import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { STORY_FINISHED } from 'storybook/internal/core-events'

// Await Storybook's completion event, including play(), rather than a particular
// component's markup. Keep navigation in the same iframe to exercise cleanup.
const selectStory = async (page: Page, id: string) => {
  const preview = page.frames().find(frame => frame.url().includes('iframe.html'))!
  await preview.evaluate(
    ({ event, id }) => {
      const channel = (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: {
            on(event: string, callback: (result: { storyId: string; status: string }) => void): void
            off(event: string, callback: (result: { storyId: string; status: string }) => void): void
          }
        }
      ).__STORYBOOK_ADDONS_CHANNEL__
      document.documentElement.removeAttribute('data-test-story-finished')
      const finished = (result: { storyId: string; status: string }) => {
        if (result.storyId === id) {
          document.documentElement.setAttribute('data-test-story-finished', `${id}:${result.status}`)
          channel.off(event, finished)
        }
      }
      channel.on(event, finished)
    },
    { event: STORY_FINISHED, id },
  )
  await page.evaluate(storyId => {
    window.history.pushState({}, '', `?path=/story/${storyId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, id)
  await expect(preview.locator('html')).toHaveAttribute('data-test-story-finished', `${id}:success`)
  return preview
}

test('runs domain mocks in standard hooks and replaces errors with success on navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const invalid = page.waitForResponse(response => response.url().endsWith('/api/me') && response.status() === 400)
  await page.goto('/?path=/story/cas-email--invalid')
  const canvas = page.frameLocator('#storybook-preview-iframe')
  await expect(canvas.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.')).toBeVisible()
  expect((await invalid).fromServiceWorker()).toBe(true)
  const reloaded = page.waitForResponse(response => response.url().endsWith('/api/me') && response.status() === 400)
  await page.getByRole('button', { name: 'Reload story', exact: true }).click()
  expect((await reloaded).fromServiceWorker()).toBe(true)
  await expect(canvas.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.')).toBeVisible()

  await selectStory(page, 'cas-email--failed')
  await expect(canvas.getByText('Не получилось сохранить почту. Попробуйте ещё раз через минуту.')).toBeVisible()
  await selectStory(page, 'cas-email--empty')
  await canvas.getByRole('button', { name: 'Добавить почту' }).click()
  await canvas.getByLabel('Почта', { exact: true }).fill('ada@example.com')
  const saved = page.waitForResponse(response => response.url().endsWith('/api/me') && response.status() === 204)
  await canvas.getByRole('button', { name: 'Сохранить' }).click()
  await expect(canvas.getByRole('button', { name: 'Добавить почту' })).toBeVisible()
  expect((await saved).fromServiceWorker()).toBe(true)
  expect(errors).toEqual([])
})

test('isolates non-CAS stories and clears strict missing-mock diagnostics on cleanup', async ({ page, context }) => {
  await page.goto('/?path=/story/cas-email--invalid')
  const canvas = page.frameLocator('#storybook-preview-iframe')
  await expect(canvas.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.')).toBeVisible()
  const preview = await selectStory(page, 'ligretto-emailsended--default-view')
  // A test-owned response makes bypass observable without depending on the
  // static server's fallback status or any unrelated story's SVG contents.
  await context.route('**/api/storybook-isolation-probe', route => route.fulfill({ status: 200, body: 'outside CAS' }))
  const response = await preview.evaluate(async () => (await fetch('/api/storybook-isolation-probe')).text())
  expect(response).toBe('outside CAS')
  await expect(canvas.locator('[data-cas-mock-error]')).toHaveCount(0)

  await selectStory(page, 'cas-email--invalid')
  await expect(canvas.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.')).toBeVisible()
  await selectStory(page, 'cas-button--primary')
  await context.route('**/assets/storybook-probe.js', route => route.fulfill({ status: 200, body: 'asset allowed' }))
  expect(await preview.evaluate(async () => (await fetch('/assets/storybook-probe.js')).text())).toBe('asset allowed')
  await expect(canvas.locator('[data-cas-mock-error]')).toHaveCount(0)
  let escaped = false
  await context.route('**/api/me', route => {
    escaped = true
    return route.fulfill({ status: 200, body: 'unexpected server response' })
  })
  const missing = await preview.evaluate(() =>
    fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: null }) }).then(
      () => 'unexpected success',
      () => 'blocked',
    ),
  )
  expect(missing).toBe('blocked')
  expect(escaped).toBe(false)
  await expect(canvas.locator('[data-cas-mock-error]')).toContainText('Unhandled CAS request: PATCH')
  await expect(canvas.locator('[data-cas-mock-error]')).toContainText('/api/me')
  await selectStory(page, 'cas-email--set')
  await expect(canvas.locator('[data-cas-mock-error]')).toHaveCount(0)
  await expect(canvas.getByRole('button', { name: 'Изменить почту' })).toBeVisible()
})
