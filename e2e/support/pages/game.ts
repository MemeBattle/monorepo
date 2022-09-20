import type { Page } from '@playwright/test'
import { byTestId } from '../utils/byTestId'

export class GamePage {
  readonly page: Page
  constructor(page) {
    this.page = page
  }

  async getPlayerReadyButton() {
    return this.page.locator(byTestId('playerReadyButton'))
  }

  async getOpponentWaiting() {
    return this.page.locator(byTestId('opponentWaiting'))
  }
}
