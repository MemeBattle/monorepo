import { expect, test, type Page } from '@playwright/test'

type StartArea = 'card' | 'hint text' | 'hint background'

const startPoint = async (page: Page, area: StartArea) => {
  const badge = page.locator('.MuiBadge-badge')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText('Q')
  return badge.evaluate((element, area) => {
    const card = element.parentElement!.querySelector('button')!
    const cardRect = card.getBoundingClientRect()
    const badgeRect = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const textRect = range.getBoundingClientRect()
    const point =
      area === 'card'
        ? { x: cardRect.x + cardRect.width / 2, y: cardRect.y + cardRect.height / 2 }
        : {
            x: area === 'hint text' ? textRect.x + textRect.width / 2 : badgeRect.x + 2,
            // The hint straddles the card edge; use the portion over the card.
            y: (Math.max(textRect.top, badgeRect.top) + Math.min(cardRect.bottom, textRect.bottom, badgeRect.bottom)) / 2,
          }
    return { ...point, hitsCard: card.contains(document.elementFromPoint(point.x, point.y)) }
  }, area)
}

for (const input of ['mouse', 'touch'] as const) {
  test.describe(input, () => {
    test.use(input === 'touch' ? { hasTouch: true, isMobile: true, viewport: { width: 393, height: 851 } } : {})

    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/fixtures/card-hotkey.html')
    })

    for (const area of ['card', 'hint text', 'hint background'] as const) {
      test(`drags from ${area}`, async ({ page }) => {
        const from = await startPoint(page, area)
        expect(from.hitsCard).toBe(true)
        const destination = page.getByRole('button', { name: 'Drops: 0' })
        const box = (await destination.boundingBox())!
        const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        const overlay = page.locator('[data-card-drag-overlay]')

        if (input === 'mouse') {
          await page.mouse.move(from.x, from.y)
          await page.mouse.down()
          await page.mouse.move(from.x, from.y - 20, { steps: 4 })
          await expect(overlay).toBeVisible()
          await page.mouse.move(to.x, to.y, { steps: 10 })
          await expect(page.getByRole('status').filter({ hasText: 'was moved over droppable area playground.0' })).toHaveCount(1)
          await page.mouse.up()
        } else {
          // Browser-level touch input exercises hit testing and the real TouchSensor.
          const session = await page.context().newCDPSession(page)
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y - 20 }] })
          await expect(overlay).toBeVisible()
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] })
          await expect(page.getByRole('status').filter({ hasText: 'was moved over droppable area playground.0' })).toHaveCount(1)
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          await session.detach()
        }

        await expect(page.getByRole('button', { name: 'Drops: 1' })).toBeVisible()
        await expect(overlay).toHaveCount(0)
        await expect(page.getByTestId('selection')).toHaveText('none')
        await expect(page.locator('.MuiBadge-badge')).toBeVisible()
      })

      test(`activates by ${input === 'mouse' ? 'click' : 'tap'} on ${area}`, async ({ page }) => {
        const point = await startPoint(page, area)
        if (input === 'mouse') {
          await page.mouse.click(point.x, point.y)
        } else {
          await page.touchscreen.tap(point.x, point.y)
        }
        await expect(page.getByTestId('selection')).toHaveText('row')
        await expect(page.locator('[data-card-drag-overlay]')).toHaveCount(0)
        await page.getByRole('button', { name: 'Drops: 0' }).click()
        await expect(page.getByRole('button', { name: 'Drops: 1' })).toBeVisible()
      })
    }

    test('keyboard shortcut still toggles the card', async ({ page }) => {
      await expect(page.locator('.MuiBadge-badge')).toBeVisible()
      await page.keyboard.press('q')
      await expect(page.getByTestId('selection')).toHaveText('row')
      await page.keyboard.press('q')
      await expect(page.getByTestId('selection')).toHaveText('none')
    })
  })
}
