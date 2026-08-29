import { test, expect, type Browser } from '@playwright/test'
import { GamePage } from '#pages/game/GamePage.page-object.ts'
import { HomePage } from '#pages/home/HomePage.page-object.ts'

/**
 * User 1 creates the room, user 2 joins it from the lobby. Each user gets an
 * isolated context, so they authenticate as two distinct stable identities.
 */
const setupTwoPlayerRoom = async (browser: Browser, roomName: string) => {
  const contextUser1 = await browser.newContext()
  const contextUser2 = await browser.newContext()
  const pageUser1 = await contextUser1.newPage()
  const pageUser2 = await contextUser2.newPage()

  const homePageUser1 = new HomePage(pageUser1)
  await homePageUser1.visitHomeUrl()
  await (await homePageUser1.getRoomNameInput()).click()
  await (await homePageUser1.getRoomNameInput()).fill(roomName)
  await (await homePageUser1.getCreateGameButton()).click()

  const gamePageUser1 = new GamePage(pageUser1)
  await expect(await gamePageUser1.getPlayerReadyButton()).toBeVisible()

  const homePageUser2 = new HomePage(pageUser2)
  await homePageUser2.visitHomeUrl()
  await (await homePageUser2.getRoom(roomName)).click()

  const gamePageUser2 = new GamePage(pageUser2)
  await expect(await gamePageUser2.getPlayersList()).toHaveCount(2)

  return { contextUser1, contextUser2, pageUser1, pageUser2, gamePageUser1, gamePageUser2 }
}

test.describe('Connection lifecycle', () => {
  test('retains a player seat across an offline reconnect', async ({ browser }, testInfo) => {
    test.setTimeout(75_000)
    const { contextUser1, contextUser2, gamePageUser1 } = await setupTwoPlayerRoom(browser, `Offline-room-${testInfo.retry}`)

    await contextUser2.setOffline(true)
    // Engine.IO may need a 25s ping interval plus a 20s ping timeout before the 5s application grace starts.
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(1, { timeout: 55_000 })

    await contextUser2.setOffline(false)
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(0, { timeout: 10_000 })
    await expect(await gamePageUser1.getPlayersList()).toHaveCount(2)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })

  test('frees the seat immediately on explicit exit, without a disconnect grace', async ({ browser }, testInfo) => {
    const { contextUser1, contextUser2, pageUser1, pageUser2, gamePageUser1, gamePageUser2 } = await setupTwoPlayerRoom(
      browser,
      `Leave-room-${testInfo.retry}`,
    )

    await (await gamePageUser2.getExitButton()).click()
    await expect(pageUser2).toHaveURL('/')

    await expect(await gamePageUser1.getPlayersList()).toHaveCount(1)
    // The seat is released right away: even after the 5s disconnect grace
    // would have expired, the leaver never shows up as disconnected.
    await pageUser1.waitForTimeout(6_000)
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(0)
    await expect(await gamePageUser1.getPlayersList()).toHaveCount(1)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })

  test('pauses a game when a player drops mid-round and lets the host resume after their return', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const { contextUser1, contextUser2, pageUser1, pageUser2, gamePageUser1 } = await setupTwoPlayerRoom(browser, `Pause-room-${testInfo.retry}`)

    const startButton = await gamePageUser1.getPlayerReadyButton()
    await expect(startButton).toHaveText('Start')
    await expect(startButton).toBeEnabled()
    await startButton.click()

    // The settings modal closes once the round leaves the lobby phase.
    await expect(await gamePageUser1.getGameSettings()).toBeHidden({ timeout: 15_000 })

    const gameUrl = pageUser2.url()
    // Closing the page is a real transport loss the server notices immediately,
    // so the 5s application grace starts without waiting out the ping timeout.
    await pageUser2.close()

    await expect(pageUser1.getByText('Round is paused')).toBeVisible({ timeout: 15_000 })
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(1)
    const resumeButton = await gamePageUser1.getPlayerReadyButton()
    await expect(resumeButton).toHaveText('Resume')
    await expect(resumeButton).toBeDisabled()

    // The same context keeps the auth token, so the rejoin uses the same stable identity.
    const pageUser2Again = await contextUser2.newPage()
    await pageUser2Again.goto(gameUrl)

    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(0, { timeout: 15_000 })
    await expect(resumeButton).toBeEnabled()
    await resumeButton.click()

    await expect(await gamePageUser1.getGameSettings()).toBeHidden({ timeout: 10_000 })
    // The rejoined page rebuilt its state from the canonical snapshot: the
    // opponent is rendered and online, and the game is back in progress.
    await expect(pageUser2Again.locator('[data-connection-state="online"]')).toHaveCount(1)
    await expect(new GamePage(pageUser2Again).getDisconnectedBadges()).toHaveCount(0)
    await expect(await new GamePage(pageUser2Again).getGameSettings()).toBeHidden()

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })

  test('hands the host role to the remaining player after the handover timeout', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const { contextUser1, contextUser2, pageUser1, gamePageUser2 } = await setupTwoPlayerRoom(browser, `Handover-room-${testInfo.retry}`)

    await expect(await gamePageUser2.getPlayerReadyButton()).toHaveText('Ready')

    await pageUser1.close()

    // The page-close transport loss starts the 5s grace immediately, and the
    // dropped host is shown as disconnected to the player who joined a room
    // that already had players (profiles are fetched in one multi-id request).
    await expect(gamePageUser2.getDisconnectedBadges()).toHaveCount(1, { timeout: 15_000 })

    // The 30s deterministic handover promotes the remaining online player,
    // whose action button switches from Ready to the host's Start.
    await expect(await gamePageUser2.getPlayerReadyButton()).toHaveText('Start', { timeout: 40_000 })
    await expect(await gamePageUser2.getPlayersList()).toHaveCount(2)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })
})
