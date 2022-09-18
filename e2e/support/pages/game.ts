import type { Page } from '@playwright/test'

export class Game {
  readonly page: Page
  constructor(page) {
    this.page = page
  }

  async visitGameUrl() {
    await this.page.goto('/')
  }

  async getMenuCreateGameButton() {
    return this.page.locator('text=Create game')
  }

  async getCreateGameButton() {
    return this.page.locator('data-test-id=CreateGameButton')
  }

  async getRoomNameInput() {
    return this.page.locator('data-test-id=CreateGameInput')
  }

  async getPlayerReadyButton() {
    return this.page.locator('data-test-id=playerReadyButton')
  }

  async getOpponentWaiting() {
    return this.page.locator('data-test-id=opponentWaiting')
  }

  async getEnterRoomButton() {
    return this.page.locator('text=Enter room')
  }

  async getRoom(roomName: string) {
    return this.page.locator(`text=${roomName}`)
  }
}
