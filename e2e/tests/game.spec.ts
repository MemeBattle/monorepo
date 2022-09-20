import { test, expect } from '@playwright/test'
import { GamePage } from '../support/pages/game'
import { HomePage } from '../support/pages/home'
import { random } from 'lodash'

test.describe('Create and enter room', () => {
  test('Two users enter one room', async ({ context }) => {
    const roomName = String(random(0, 10000))
    const pageUser1 = await context.newPage()
    const pageUser2 = await context.newPage()

    const homePageUser1 = new HomePage(pageUser1)
    await homePageUser1.visitHomeUrl()

    /**
     * User 1 create game
     */
    await (await homePageUser1.getMenuCreateGameButton()).click()
    await (await homePageUser1.getRoomNameInput()).click()
    await (await homePageUser1.getRoomNameInput()).fill(roomName)
    await (await homePageUser1.getCreateGameButton()).click()

    const gamePageUser1 = new GamePage(pageUser1)
    await expect(await gamePageUser1.getPlayerReadyButton()).toBeVisible({ timeout: 30000 })

    /**
     * User 2 enter created room
     */
    const homePageUser2 = new HomePage(pageUser2)
    await homePageUser2.visitHomeUrl()

    await (await homePageUser2.getEnterRoomButton()).click()
    await (await homePageUser2.getRoom(roomName)).click()

    const gamePageUser2 = new GamePage(pageUser2)

    await expect(await gamePageUser2.getOpponentWaiting()).toBeVisible({ timeout: 30000 })
  })
})
