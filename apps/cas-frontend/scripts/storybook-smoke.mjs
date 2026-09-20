import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const baseURL = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006'
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
const page = await browser.newPage()
page.setDefaultTimeout(30_000)
const failures = []
page.on('pageerror', error => failures.push(error.message))
const wire = []
page.on('response', response => {
  if (new URL(response.url()).pathname.startsWith('/api/')) {
    wire.push({ url: response.url(), status: response.status(), mocked: response.fromServiceWorker() })
  }
})
try {
  await page.goto(`${baseURL}/?path=/story/cas-email--invalid`)
  const frame = page.frameLocator('#storybook-preview-iframe')
  await frame.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.').waitFor()
  assert(
    wire.some(response => response.status === 400 && response.mocked),
    'Invalid story must reach the mocked API',
  )
  console.log('PASS invalid story: real updateEmail → MSW 400 → field error')

  const select = async storyId => {
    await page.evaluate(id => {
      window.history.pushState({}, '', `?path=/story/${id}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, storyId)
  }
  await select('cas-email--failed')
  await frame.getByText('Не получилось сохранить почту. Попробуйте ещё раз через минуту.').waitFor()
  console.log('PASS failed story: real fetch rejection → form error')

  await select('cas-email--empty')
  await frame.getByRole('button', { name: 'Добавить почту' }).waitFor()
  await frame.getByRole('button', { name: 'Добавить почту' }).click()
  await frame.getByLabel('Почта', { exact: true }).fill('ada@example.com')
  await frame.getByRole('button', { name: 'Сохранить' }).click()
  await frame.getByRole('button', { name: 'Добавить почту' }).waitFor()
  assert(
    wire.some(response => response.status === 204 && response.mocked),
    'Success must be intercepted and empty',
  )
  console.log('PASS success after failure: per-story handler replacement, 204')

  await select('ligretto-emailsended--default-view')
  await frame.locator('svg[viewBox="0 0 346.61 344.48"]').waitFor()
  const preview = page.frames().find(candidate => candidate.url().includes('iframe.html'))
  assert(preview, 'preview iframe exists')
  const nonCas = await preview.evaluate(async () => {
    const response = await fetch('/api/storybook-isolation-probe')
    return { status: response.status, diagnostic: !!document.querySelector('[data-cas-mock-error]') }
  })
  assert.equal(nonCas.status, 404, 'non-CAS request reaches static server with MSW stopped')
  assert.equal(nonCas.diagnostic, false)
  console.log('PASS CAS → non-CAS: worker stopped, no CAS error overlay')

  await select('cas-email--invalid')
  await frame.getByText('Проверьте адрес: в нём ошибка или недопустимые символы.').waitFor()
  console.log('PASS non-CAS → CAS and story rerun: worker restarted, error scenario restored')
  await preview.evaluate(() => fetch('/api/unanswered-browser-probe').catch(() => {}))
  await frame.locator('[data-cas-mock-error]').waitFor()
  assert.match(await frame.locator('[data-cas-mock-error]').innerText(), /Unhandled CAS request: GET.*unanswered-browser-probe/)
  console.log('PASS caught unanswered API: visible blocking diagnostic')
  await select('cas-email--set')
  await frame.getByRole('button', { name: 'Изменить почту' }).waitFor()
  assert.equal(await frame.locator('[data-cas-mock-error]').count(), 0)
  assert.deepEqual(failures, [])
  console.log('PASS next story clears diagnostic; no page errors')
} catch (error) {
  console.error('Page errors:', failures)
  for (const frame of page.frames()) {
    console.error(frame.url(), (await frame.locator('body').innerText()).slice(0, 3000))
  }
  throw error
} finally {
  await browser.close()
}
