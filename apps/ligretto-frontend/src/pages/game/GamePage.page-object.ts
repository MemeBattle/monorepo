import type { Page } from 'playwright'

export class GamePage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async getPlayerReadyButton() {
    return this.page.getByTestId('GameSettings-ReadyButton')
  }

  async getExitButton() {
    return this.page.getByTestId('GameSettings-ExitButton')
  }

  async getGameSettings() {
    return this.page.getByTestId('GameSettings')
  }

  async getPlayersList() {
    return this.page.getByTestId('PlayersScoresTable-PlayersScoresTableRow')
  }

  getDisconnectedBadges() {
    return this.page.getByTitle(/\(disconnected\)$/)
  }
}
