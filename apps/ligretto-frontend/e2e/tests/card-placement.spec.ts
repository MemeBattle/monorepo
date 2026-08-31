import { test, expect } from '@playwright/test'

const harness = '/e2e/card-placement-harness.html'

const mouseDrag = async (page: import('@playwright/test').Page) => {
  const source = await page.getByTestId('drag-source').boundingBox()
  const target = await page.getByTestId('drop-target').boundingBox()
  expect(source).toBeTruthy()
  expect(target).toBeTruthy()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(source!.x + source!.width / 2 + 10, source!.y + source!.height / 2, { steps: 2 })
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 10 })
  await page.mouse.up()
}

test('mouse drag places a row card without firing click activation', async ({ page }) => {
  await page.goto(harness)

  await mouseDrag(page)

  await expect(page.getByTestId('placement-action')).toContainText('"cardIndex":1')
  await expect(page.getByTestId('placement-action')).toContainText('"playgroundDeckIndex":4')
  await expect(page.getByTestId('click-count')).toHaveText('0')
})

test('invalid drop dispatches nothing', async ({ page }) => {
  await page.goto(`${harness}?valid=false`)

  await mouseDrag(page)

  await expect(page.getByTestId('placement-action')).toHaveText('')
})

test('value-1 card can be dragged to a chosen empty deck', async ({ page }) => {
  await page.goto(`${harness}?value=1`)

  await mouseDrag(page)

  await expect(page.getByTestId('placement-action')).toContainText('"playgroundDeckIndex":4')
})

test('short pointer interaction remains a click', async ({ page }) => {
  await page.goto(harness)

  await page.getByTestId('drag-source').click()

  await expect(page.getByTestId('click-count')).toHaveText('1')
  await expect(page.getByTestId('placement-action')).toHaveText('')
})

test('releasing outside the playground cancels without dispatch', async ({ page }) => {
  await page.goto(harness)
  const source = await page.getByTestId('drag-source').boundingBox()
  expect(source).toBeTruthy()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(source!.x + source!.width / 2 + 10, source!.y + source!.height / 2, { steps: 2 })
  await page.mouse.move(1, 1, { steps: 6 })
  await page.mouse.up()

  await expect(page.getByTestId('placement-action')).toHaveText('')
})

test('touch drag places a card on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'touch behavior runs in the mobile project')
  await page.goto(harness)

  const source = await page.getByTestId('drag-source').boundingBox()
  const target = await page.getByTestId('drop-target').boundingBox()
  expect(source).toBeTruthy()
  expect(target).toBeTruthy()

  const client = await page.context().newCDPSession(page)
  const start = { x: source!.x + source!.width / 2, y: source!.y + source!.height / 2 }
  const end = { x: target!.x + target!.width / 2, y: target!.y + target!.height / 2 }
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
  await page.waitForTimeout(180)
  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * step) / 8,
          y: start.y + ((end.y - start.y) * step) / 8,
        },
      ],
    })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  await expect(page.getByTestId('placement-action')).toContainText('"playgroundDeckIndex":4')
})
