import type { Page } from '@playwright/test'

export class GamePage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async getPlayerReadyButton() {
    return this.page.getByTestId('GameSettings-ReadyButton')
  }

  async getPlayersList() {
    return this.page.getByTestId('PlayersScoresTable-PlayersScoresTableRow')
  }
}
