import type { Page } from '@playwright/test'
import { byTestId } from '../utils/byTestId'

export class GamePage {
  constructor(readonly page: Page) {}

  async getPlayerReadyButton() {
    return this.page.locator(byTestId('playerReadyButton'))
  }

  async getOpponentWaiting() {
    return this.page.locator(byTestId('opponentWaiting'))
  }
}
