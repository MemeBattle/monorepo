import { test, expect } from '@playwright/test'
import { Game } from '../support/pages/game'
import { random } from 'lodash'

test('Create and enter room', async ({ context }) => {
  const roomName = String(random(0, 100))
  const createdPageOne = await context.newPage()
  const createdPageTwo = await context.newPage()
  const pageOne = new Game(createdPageOne)
  const pageTwo = new Game(createdPageTwo)
  // User 1 visit game page
  await pageOne.visitGameUrl()
  // User 2 visit game page
  await pageTwo.visitGameUrl()

  // // User 1 create game // //

  await (await pageOne.getMenuCreateGameButton()).click()
  await (await pageOne.getRoomNameInput()).click()
  await (await pageOne.getRoomNameInput()).fill(roomName)
  await (await pageOne.getCreateGameButton()).click()

  await expect(await pageOne.getPlayerReadyButton()).toBeVisible({ timeout: 30000 })

  // // User 2 enter created room // //

  await (await pageTwo.getEnterRoomButton()).click()
  await (await pageTwo.getRoom(roomName)).click()

  await expect(await pageTwo.getOpponentWaiting()).toBeVisible({ timeout: 30000 })
})
