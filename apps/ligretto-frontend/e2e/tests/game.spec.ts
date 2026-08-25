import { test, expect } from '@playwright/test'
import { GamePage } from '#pages/game/GamePage.page-object.ts'
import { HomePage } from '#pages/home/HomePage.page-object.ts'

test.describe('Create and enter room', () => {
  test('retains a player seat across an offline reconnect', async ({ browser }, testInfo) => {
    test.setTimeout(75_000)
    const roomName = `Test-room-${testInfo.retry}`
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

    await contextUser2.setOffline(true)
    // Engine.IO may need a 25s ping interval plus a 20s ping timeout before the 5s application grace starts.
    await expect(pageUser1.getByTitle(/\(disconnected\)$/)).toHaveCount(1, { timeout: 55_000 })

    await contextUser2.setOffline(false)
    await expect(pageUser1.getByTitle(/\(disconnected\)$/)).toHaveCount(0, { timeout: 10_000 })
    await expect(await gamePageUser1.getPlayersList()).toHaveCount(2)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })
})
