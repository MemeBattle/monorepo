import type { Page } from '@playwright/test'

export class HomePage {
  constructor(readonly page: Page) {}

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
