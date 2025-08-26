import { inject, injectable } from 'inversify'
import { IPlayerService } from '../entities/player/player.service'
import { IPlaygroundService } from '../entities/playground'
import { IGameService } from '../entities/game/game.service'
import { IOC_TYPES } from '../IOC_TYPES'
import type { Game, GameResults, UUID } from '@memebattle/ligretto-shared'

export interface IGameplay {
  startGame(gameId: UUID): Promise<void>
  playerPutCard(gameId: UUID, playerId: UUID, cardPosition: number, deckPosition?: number): Promise<void>
  playerPutFromStackOpenDeck(gameId: UUID, playerId: UUID, deckPosition?: number): Promise<void>
  playerTakeFromLigrettoDeck(gameId: UUID, playerId: UUID): Promise<{ game?: Game; gameResults?: GameResults }>
  playerTakeFromStackDeck(gameId: UUID, playerId: UUID): Promise<void>
}

@injectable()
export class Gameplay implements IGameplay {
  @inject(IOC_TYPES.IGameService) private gameService: IGameService
  @inject(IOC_TYPES.IPlayerService) private playerService: IPlayerService
  @inject(IOC_TYPES.IPlaygroundService) private playgroundService: IPlaygroundService

  async startGame(gameId: UUID) {
    try {
      await this.gameService.startGame(gameId)
    } catch (e) {
      console.log(e)
    }
  }

  async playerPutCard(gameId: UUID, playerId: UUID, cardPosition: number, deckPosition?: number) {
    try {
      const card = await this.playerService.getCard(gameId, playerId, cardPosition)
      if (!card) {
        return
      }

      const finalDeckPosition = await this.playgroundService.getAvailableDeckPosition(gameId, card, deckPosition)
      if (finalDeckPosition === undefined || finalDeckPosition === -1) {
        return
      }

      await this.playgroundService.putCard(gameId, card, finalDeckPosition)
      await this.playerService.removeCard(gameId, playerId, cardPosition)
    } catch (e) {
      console.log(e)
    }
  }

  async playerPutFromStackOpenDeck(gameId: UUID, playerId: UUID, deckPosition?: number) {
    try {
      const card = await this.playerService.getCardFromStackOpenDeck(gameId, playerId)
      if (!card) {
        return
      }
      const finalDeckPosition = await this.playgroundService.getAvailableDeckPosition(gameId, card, deckPosition)

      if (finalDeckPosition === -1 || finalDeckPosition === undefined) {
        return
      }

      await this.playgroundService.putCard(gameId, card, finalDeckPosition)
      await this.playerService.removeCardFromStackOpenDeck(gameId, playerId)
    } catch (e) {
      console.log(e)
    }
  }

  async playerTakeFromLigrettoDeck(gameId: UUID, playerId: UUID): Promise<{ game?: Game; gameResults?: GameResults }> {
    try {
      const remaining = await this.playerService.takeFromLigrettoDeck(gameId, playerId)

      if (remaining === 0) {
        return this.gameService.finishRound(gameId)
      }

      const game = await this.gameService.getGame(gameId)
      return { game }
    } catch (e) {
      console.log(e)
      return {}
    }
  }

  async playerTakeFromStackDeck(gameId: UUID, playerId: UUID) {
    try {
      await this.playerService.takeFromStackDeck(gameId, playerId)
    } catch (e) {
      console.log(e)
    }
  }

  // XXX: for now this method is not used
  private async endGame(gameId: UUID) {
    try {
      const roundResult = await this.gameService.getRoundResult(gameId)
      await this.gameService.endGame(gameId)

      return { roundResult }
    } catch (e) {
      console.log(e)
    }
  }
}
