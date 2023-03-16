import type { Page } from '@playwright/test'
import { byTestId } from '../utils/byTestId'

export class GamePage {
  constructor(readonly page: Page) {}

  async getPlayerReadyButton() {
    return this.page.locator(byTestId('GameSettings-ReadyButton'))
  }

  async getPlayersList() {
    return this.page.locator(byTestId('PlayersScoresTable-PlayersScoresTableRow'))
  }
}
