import { test, expect, devices, type Browser } from '@playwright/test'
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
  await expect(await gamePageUser1.getStartButton()).toBeVisible()

  const homePageUser2 = new HomePage(pageUser2)
  await homePageUser2.visitHomeUrl()
  await (await homePageUser2.getRoom(roomName)).click()

  const gamePageUser2 = new GamePage(pageUser2)
  await expect(await gamePageUser2.getPlayersList()).toHaveCount(2)

  return { contextUser1, contextUser2, pageUser1, pageUser2, gamePageUser1, gamePageUser2 }
}

test.describe('Connection lifecycle', () => {
  test('retains a player seat across an offline reconnect during a round', async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const { contextUser1, contextUser2, gamePageUser1 } = await setupTwoPlayerRoom(browser, `Offline-room-${testInfo.retry}`)

    const startButton = await gamePageUser1.getStartButton()
    await expect(startButton).toHaveText('Start')
    await expect(startButton).toBeEnabled()
    await startButton.click()
    await expect(await gamePageUser1.getGameSettings()).toBeHidden({ timeout: 15_000 })

    await contextUser2.setOffline(true)
    // Up to 45s of silence, the 30s sweep that notices it and the 5s application grace.
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(1, { timeout: 90_000 })

    await contextUser2.setOffline(false)
    // The client retries every 2s.
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(0, { timeout: 20_000 })
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

    const startButton = await gamePageUser1.getStartButton()
    await expect(startButton).toHaveText('Start')
    await expect(startButton).toBeEnabled()
    await startButton.click()

    // The settings modal closes once the round leaves the lobby phase.
    await expect(await gamePageUser1.getGameSettings()).toBeHidden({ timeout: 15_000 })

    const gameUrl = pageUser2.url()
    // Closing the page is a real transport loss the server notices immediately,
    // so the 5s application grace starts without waiting out the 45s heartbeat silence.
    await pageUser2.close()

    await expect(pageUser1.getByText('Round is paused')).toBeVisible({ timeout: 15_000 })
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(1)
    const resumeButton = await gamePageUser1.getStartButton()
    await expect(resumeButton).toHaveText('Resume')
    await expect(resumeButton).toBeDisabled()

    // The same context keeps the session cookie, so the rejoin uses the same stable identity.
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

  test('hands the host role to the remaining player once the host is offline', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const { contextUser1, contextUser2, pageUser1, gamePageUser2 } = await setupTwoPlayerRoom(browser, `Handover-room-${testInfo.retry}`)

    await expect(await gamePageUser2.getPlayerReadyButton()).toHaveText("I'm ready")
    await expect(await gamePageUser2.getStartButton()).toBeHidden()

    await pageUser1.close()

    // The page-close transport loss starts the 5s grace immediately, and the
    // dropped host is shown as disconnected to the player who joined a room
    // that already had players (profiles are fetched in one multi-id request).
    await expect(gamePageUser2.getDisconnectedBadges()).toHaveCount(1, { timeout: 15_000 })

    // The same step promotes the remaining online player, who gets the host's Start.
    await expect(await gamePageUser2.getStartButton()).toBeVisible({ timeout: 15_000 })
    await expect(await gamePageUser2.getPlayersList()).toHaveCount(2)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })
})

test.describe('Kicking a participant', () => {
  test('sends every tab of the kicked user home, frees the seat and lets them come back on purpose', async ({ browser }, testInfo) => {
    test.setTimeout(60_000)
    const roomName = `Kick-${testInfo.retry}-${Date.now().toString(36)}`
    const { contextUser1, contextUser2, pageUser1, pageUser2, gamePageUser1 } = await setupTwoPlayerRoom(browser, roomName)
    const pageUser2SecondTab = await contextUser2.newPage()
    await pageUser2SecondTab.goto(pageUser2.url())
    await expect(await new GamePage(pageUser2SecondTab).getPlayersList()).toHaveCount(2)

    await expect(new GamePage(pageUser2).getKickButtons()).toHaveCount(0)
    await expect(gamePageUser1.getKickButtons()).toHaveCount(1)
    await gamePageUser1.getKickButtons().click()

    for (const page of [pageUser2, pageUser2SecondTab]) {
      await expect(page).toHaveURL('/')
    }
    await expect(await gamePageUser1.getPlayersList()).toHaveCount(1)
    await expect(pageUser1.getByTestId('PlayersScoresTable-FreeSeat')).toHaveCount(3)

    await pageUser2SecondTab.close()
    await (await new HomePage(pageUser2).getRoom(roomName)).click()
    await expect(await gamePageUser1.getPlayersList()).toHaveCount(2)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })
})

test.describe('Roles between rounds', () => {
  test('a player watches instead, takes a seat again and plays the next round', async ({ browser }, testInfo) => {
    test.setTimeout(60_000)
    const { contextUser1, contextUser2, gamePageUser1, gamePageUser2 } = await setupTwoPlayerRoom(browser, `Roles-room-${testInfo.retry}`)

    await expect(gamePageUser1.getSpectateButton()).toBeHidden()
    await gamePageUser2.getSpectateButton().click()

    await expect(await gamePageUser1.getPlayersList()).toHaveCount(1)
    await expect(await gamePageUser2.getPlayersList()).toHaveCount(1)
    await expect(await gamePageUser2.getPlayerReadyButton()).toBeHidden()
    await expect(gamePageUser1.getTakeSeatButtons()).toHaveCount(0)

    await expect(gamePageUser2.getTakeSeatButtons()).toHaveCount(1)
    await gamePageUser2.getTakeSeatButtons().click()

    await expect(await gamePageUser1.getPlayersList()).toHaveCount(2)
    await expect(await gamePageUser2.getPlayerReadyButton()).toBeVisible()
    await expect(gamePageUser2.getTakeSeatButtons()).toHaveCount(0)

    const startButton = await gamePageUser1.getStartButton()
    await expect(startButton).toBeEnabled()
    await startButton.click()

    await expect(gamePageUser2.getOwnLigrettoDeck()).toBeVisible({ timeout: 15_000 })
    await expect(gamePageUser2.getOpponents()).toHaveCount(1)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })
})

test.describe('Game settings layout', () => {
  test('stays a centered dialog on desktop, even in a short window, and fills a phone screen in both orientations', async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(60_000)
    const safeAreaInsets = { top: 0, right: 47, bottom: 21, left: 47 }
    await (await page.context().newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets: safeAreaInsets })
    const homePage = new HomePage(page)
    await homePage.visitHomeUrl()
    await (await homePage.getRoomNameInput()).click()
    await (await homePage.getRoomNameInput()).fill(`Layout-${testInfo.retry}-${Date.now().toString(36)}`)
    await (await homePage.getCreateGameButton()).click()

    const desktopGamePage = new GamePage(page)
    await expect(await desktopGamePage.getStartButton()).toBeVisible()
    const desktopGameSettings = await desktopGamePage.getGameSettings()
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1280, height: 580 },
    ]) {
      await page.setViewportSize(viewport)
      await expect
        .poll(async () => {
          const { x, y, width, height } = (await desktopGameSettings.boundingBox())!
          return { centered: Math.abs(x - (viewport.width - width) / 2) < 1, insetX: x > 0, insetY: y > 0 && y + height < viewport.height }
        })
        .toEqual({ centered: true, insetX: true, insetY: true })
      await expect(desktopGameSettings).toHaveCSS('padding', '32px')
      await expect(desktopGameSettings).toHaveCSS('border-radius', '8px')
    }

    const phoneContext = await browser.newContext({ ...devices['Pixel 5'] })
    const phonePage = await phoneContext.newPage()
    await (await phoneContext.newCDPSession(phonePage)).send('Emulation.setSafeAreaInsetsOverride', { insets: safeAreaInsets })
    await phonePage.goto(page.url())
    const phoneGamePage = new GamePage(phonePage)
    const phoneGameSettings = await phoneGamePage.getGameSettings()
    const phoneButtons = [await phoneGamePage.getPlayerReadyButton(), await phoneGamePage.getExitButton()]
    await expect(phoneButtons[0]).toBeVisible()
    for (const viewport of [
      { width: 393, height: 851 },
      { width: 851, height: 393 },
      { width: 568, height: 320 },
    ]) {
      await phonePage.setViewportSize(viewport)
      await expect
        .poll(async () => {
          const { x, y, width, height } = (await phoneGameSettings.boundingBox())!
          return { x, width, coversHeight: y <= 0 && y + height >= viewport.height }
        })
        .toEqual({ x: 0, width: viewport.width, coversHeight: true })
      await expect(phoneGameSettings).toHaveCSS('padding', '16px 63px 37px')

      for (const button of phoneButtons) {
        await button.click({ trial: true })
        await expect(button).toBeInViewport({ ratio: 0.9 })
      }
    }

    await phoneContext.close()
  })
})

test.describe('Direct game link', () => {
  /**
   * Regression for the identity race on a cold /game/:id load: the auth
   * bootstrap used to run once per dispatch of the nested connect-to-room
   * cascade, minting several temporary users at once. The socket then joined
   * the room as one guest while redux rendered as another, so the joiner saw
   * no own cards and every player as an opponent.
   */
  test('seats a fresh guest who opens the game link directly', async ({ browser }, testInfo) => {
    test.setTimeout(60_000)
    const contextUser1 = await browser.newContext()
    const pageUser1 = await contextUser1.newPage()

    const homePageUser1 = new HomePage(pageUser1)
    await homePageUser1.visitHomeUrl()
    await (await homePageUser1.getRoomNameInput()).click()
    // Unique per run (room names max out at 20 chars): rooms linger on the
    // backend until the all-offline deletion timeout, so a retry-based suffix
    // alone can collide across invocations.
    await (await homePageUser1.getRoomNameInput()).fill(`Direct-${testInfo.retry}-${Date.now().toString(36)}`)
    await (await homePageUser1.getCreateGameButton()).click()

    const gamePageUser1 = new GamePage(pageUser1)
    await expect(await gamePageUser1.getStartButton()).toBeVisible()

    // A brand-new context holds no session cookie, and the page lands straight on
    // the game URL — the exact cold load the identity race was triggered by.
    const contextUser2 = await browser.newContext()
    const pageUser2 = await contextUser2.newPage()
    await pageUser2.goto(pageUser1.url())

    const gamePageUser2 = new GamePage(pageUser2)
    await expect(await gamePageUser2.getPlayersList()).toHaveCount(2)

    const readyButton = await gamePageUser2.getPlayerReadyButton()
    await expect(readyButton).toHaveText("I'm ready")
    await readyButton.click()

    const startButton = await gamePageUser1.getStartButton()
    await expect(startButton).toHaveText('Start')
    await expect(startButton).toBeEnabled()
    await startButton.click()

    // The joiner is a seated player, not an accidental spectator: their own
    // deck is dealt and rendered, and the creator is their only opponent.
    await expect(gamePageUser2.getOwnLigrettoDeck()).toBeVisible({ timeout: 15_000 })
    await expect(gamePageUser2.getOpponents()).toHaveCount(1)
    await expect(gamePageUser1.getOwnLigrettoDeck()).toBeVisible()
    await expect(gamePageUser1.getOpponents()).toHaveCount(1)

    // No phantom guests joined along the way: once the disconnect grace would
    // have expired, nobody is offline and the round is not paused.
    await pageUser2.waitForTimeout(6_000)
    await expect(pageUser1.getByText('Round is paused')).toBeHidden()
    await expect(pageUser2.getByText('Round is paused')).toBeHidden()
    await expect(gamePageUser1.getDisconnectedBadges()).toHaveCount(0)
    await expect(gamePageUser2.getDisconnectedBadges()).toHaveCount(0)

    await Promise.all([contextUser1.close(), contextUser2.close()])
  })
})
