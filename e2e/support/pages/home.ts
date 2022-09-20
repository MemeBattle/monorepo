import type { Page } from '@playwright/test'
import { byTestId } from '../utils/byTestId'

export class HomePage {
  readonly page: Page
  constructor(page) {
    this.page = page
  }

  async visitHomeUrl() {
    await this.page.goto('/')
  }

  async getMenuCreateGameButton() {
    return this.page.locator('text=Create game')
  }

  async getCreateGameButton() {
    return this.page.locator(byTestId('CreateGameButton'))
  }

  async getRoomNameInput() {
    return this.page.locator(byTestId('CreateGameInput'))
  }

  async getEnterRoomButton() {
    return this.page.locator('text=Enter room')
  }

  async getRoom(roomName: string) {
    return this.page.locator(`text=${roomName}`)
  }
}
