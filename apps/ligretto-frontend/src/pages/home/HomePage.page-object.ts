import type { Page } from '@playwright/test'

export class HomePage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async visitHomeUrl() {
    await this.page.goto('/')
  }

  async getCreateGameButton() {
    return this.page.getByTestId('CreateGameButton')
  }

  async getRoomNameInput() {
    return this.page.getByTestId('CreateGameInput')
  }

  async getRoom(roomName: string) {
    return this.page.getByTestId(`RoomsList-RoomItem-${roomName}`)
  }
}
