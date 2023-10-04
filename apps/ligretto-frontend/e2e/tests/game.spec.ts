import { test, expect, chromium } from '@playwright/test'
import { GamePage } from '../../src/pages/game/GamePage.page-object'
import { HomePage } from '../../src/pages/home/HomePage.page-object'
import { random } from 'lodash'

test.describe('Create and enter room', () => {
  test('Two users enter one room', async () => {
    const roomName = `Test-room-${random(0, 10000)}`
    const browser = await chromium.launch()
    const contextUser1 = await browser.newContext()
    const contextUser2 = await browser.newContext()
    const pageUser1 = await contextUser1.newPage()
    const pageUser2 = await contextUser2.newPage()

    const homePageUser1 = new HomePage(pageUser1)
    await homePageUser1.visitHomeUrl()

    /**
     * User 1 create game
     */
    await (await homePageUser1.getRoomNameInput()).click()
    await (await homePageUser1.getRoomNameInput()).fill(roomName)
    await (await homePageUser1.getCreateGameButton()).click()

    const gamePageUser1 = new GamePage(pageUser1)
    await expect(await gamePageUser1.getPlayerReadyButton()).toBeVisible()

    /**
     * User 2 enter created room
     */
    const homePageUser2 = new HomePage(pageUser2)
    await homePageUser2.visitHomeUrl()

    await (await homePageUser2.getRoom(roomName)).click()

    const gamePageUser2 = new GamePage(pageUser2)

    await expect(await gamePageUser2.getPlayersList()).toHaveCount(2)
  })
})
