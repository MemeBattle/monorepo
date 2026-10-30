import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { STORY_FINISHED } from 'storybook/internal/core-events'

// Observe completion from the manager before initial rendering starts. A visible
// canvas can still have pending play/afterEach work; navigating then reloads the
// iframe and loses listeners installed inside it.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(eventName => {
    window.addEventListener('message', event => {
      const preview = document.querySelector<HTMLIFrameElement>('#storybook-preview-iframe')
      if (event.source !== preview?.contentWindow || event.origin !== location.origin || typeof event.data !== 'string') {
        return
      }
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message?.key === 'storybook-channel' && message.event?.type === eventName) {
        const result = message.event.args[0]
        document.documentElement.setAttribute('data-test-story-finished', `${result.storyId}:${result.status}`)
      }
    })
  }, STORY_FINISHED)
})

const waitForStory = async (page: Page, id: string) => {
  await expect(page.locator('html')).toHaveAttribute('data-test-story-finished', `${id}:success`)
}

// Keep navigation in the same iframe to exercise cleanup, after the previous
// story has finished all of its hooks (including accessibility checks).
const selectStory = async (page: Page, id: string) => {
  const current = new URL(page.url()).searchParams.get('path')!.replace('/story/', '')
  await waitForStory(page, current)
  await page.evaluate(storyId => {
    document.documentElement.removeAttribute('data-test-story-finished')
    window.history.pushState({}, '', `?path=/story/${storyId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, id)
  await waitForStory(page, id)
  return page.frames().find(frame => frame.url().includes('iframe.html'))!
}

test('runs domain mocks in standard hooks and replaces errors with success on navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const invalid = page.waitForResponse(response => response.url().endsWith('/api/me') && response.status() === 400)
  await page.goto('/?path=/story/cas-email--invalid')
  const canvas = page.frameLocator('#storybook-preview-iframe')
  await expect(canvas.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.')).toBeVisible()
  expect((await invalid).fromServiceWorker()).toBe(true)
  await waitForStory(page, 'cas-email--invalid')
  await page.locator('html').evaluate(element => element.removeAttribute('data-test-story-finished'))
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
  const preview = await selectStory(page, 'ligretto-ligrettologo--default-view')
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

test('waits for pending accessibility checks before navigating without reloading the preview', async ({ page, context }) => {
  let release = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let requested = () => {}
  const checking = new Promise<void>(resolve => {
    requested = resolve
  })
  // The error UI is ready before Storybook's a11y afterEach has finished.
  await context.route('**/assets/axe-*.js', async route => {
    requested()
    await gate
    await route.continue()
  })
  try {
    await page.goto('/?path=/story/cas-email--invalid')
    const canvas = page.frameLocator('#storybook-preview-iframe')
    await expect(canvas.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.')).toBeVisible()
    await checking
    await canvas.locator('html').evaluate(element => element.setAttribute('data-test-original-preview', 'true'))
    const navigation = selectStory(page, 'cas-email--failed')
    try {
      // Observe the attempted navigation while afterEach is still blocked.
      // An immediate URL assertion could pass before selectStory has run.
      await expect(page.waitForURL('**/?path=/story/cas-email--failed', { timeout: 1000 })).rejects.toThrow(/Timeout/)
      await expect(canvas.locator('html')).toHaveAttribute('data-test-original-preview', 'true')
    } finally {
      release()
      await navigation
    }
    await expect(canvas.getByText('Не получилось сохранить почту. Попробуйте ещё раз через минуту.')).toBeVisible()
    await expect(canvas.locator('html')).toHaveAttribute('data-test-original-preview', 'true')
  } finally {
    release()
  }
})
