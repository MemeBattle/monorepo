import type { Page } from 'playwright'

export class GamePage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async getPlayerReadyButton() {
    return this.page.getByTestId('GameSettings-ReadyButton')
  }

  async getStartButton() {
    return this.page.getByTestId('GameSettings-StartButton')
  }

  async getExitButton() {
    return this.page.getByTestId('GameSettings-ExitButton')
  }

  async getGameSettings() {
    return this.page.getByTestId('GameSettings')
  }

  getSpectateButton() {
    return this.page.getByTestId('GameSettings-SpectateButton')
  }

  getSpectatorsSection() {
    return this.page.getByTestId('GameSettings-Spectators')
  }

  getPlayersTable() {
    return this.page.getByTestId('PlayersScoresTable')
  }

  /** Player rows and free seats, in table order. */
  getSeatRows() {
    return this.page.locator('[data-test-id="PlayersScoresTable-PlayersScoresTableRow"], [data-test-id="PlayersScoresTable-FreeSeat"]')
  }

  getViewerSpectatorBadge() {
    return this.page.getByTestId('GameSettings-ViewerSpectatorBadge')
  }

  getTakeSeatButtons() {
    return this.page.getByTestId('PlayersScoresTable-TakeSeatButton')
  }

  async getPlayersList() {
    return this.page.getByTestId('PlayersScoresTable-PlayersScoresTableRow')
  }

  getKickButtons() {
    return this.page.getByTestId('PlayersScoresTable-KickButton')
  }

  getDisconnectedBadges() {
    return this.page.getByTitle(/\(disconnected\)$/)
  }

  /** Rendered only when the viewer is a seated player with dealt cards. */
  getOwnLigrettoDeck() {
    return this.page.getByTestId('LigrettoDeck')
  }

  getOpponents() {
    return this.page.locator('[data-connection-state]')
  }
}
