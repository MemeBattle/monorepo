import type { Page } from '@playwright/test'

export class GamePage {
  constructor(readonly page: Page) {}

  async getPlayerReadyButton() {
    return this.page.getByTestId('GameSettings-ReadyButton')
  }

  async getPlayersList() {
    return this.page.getByTestId('PlayersScoresTable-PlayersScoresTableRow')
  }
}
