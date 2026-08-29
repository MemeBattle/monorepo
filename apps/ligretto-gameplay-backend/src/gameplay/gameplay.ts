import { inject, injectable } from 'inversify'
import type { PlayerService } from '../entities/player/player.service'
import type { PlaygroundService } from '../entities/playground'
import type { GameService } from '../entities/game/game.service'
import { IOC_TYPES } from '../IOC_TYPES'
import type { Game, GameResults, UUID } from '@memebattle/ligretto-shared'

@injectable()
export class Gameplay {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.PlayerService) private playerService: PlayerService
  @inject(IOC_TYPES.PlaygroundService) private playgroundService: PlaygroundService

  startGame(gameId: UUID) {
    try {
      this.gameService.startGame(gameId)
    } catch (e) {
      console.log(e)
    }
  }

  playerPutCard(gameId: UUID, playerId: UUID, cardPosition: number, deckPosition?: number) {
    try {
      const card = this.playerService.getCard(gameId, playerId, cardPosition)
      if (!card) {
        return
      }

      const finalDeckPosition = this.playgroundService.getAvailableDeckPosition(gameId, card, deckPosition)
      if (finalDeckPosition === undefined || finalDeckPosition === -1) {
        return
      }

      this.playgroundService.putCard(gameId, card, finalDeckPosition)
      this.playerService.removeCard(gameId, playerId, cardPosition)
    } catch (e) {
      console.log(e)
    }
  }

  playerPutFromStackOpenDeck(gameId: UUID, playerId: UUID, deckPosition?: number) {
    try {
      const card = this.playerService.getCardFromStackOpenDeck(gameId, playerId)
      if (!card) {
        return
      }
      const finalDeckPosition = this.playgroundService.getAvailableDeckPosition(gameId, card, deckPosition)

      if (finalDeckPosition === -1 || finalDeckPosition === undefined) {
        return
      }

      this.playgroundService.putCard(gameId, card, finalDeckPosition)
      this.playerService.removeCardFromStackOpenDeck(gameId, playerId)
    } catch (e) {
      console.log(e)
    }
  }

  async playerTakeFromLigrettoDeck(gameId: UUID, playerId: UUID): Promise<{ game?: Game; gameResults?: GameResults }> {
    try {
      const remaining = this.playerService.takeFromLigrettoDeck(gameId, playerId)

      if (remaining === 0) {
        return await this.gameService.finishRound(gameId)
      }

      const game = this.gameService.getGame(gameId)
      return { game }
    } catch (e) {
      console.log(e)
      return {}
    }
  }

  playerTakeFromStackDeck(gameId: UUID, playerId: UUID) {
    try {
      this.playerService.takeFromStackDeck(gameId, playerId)
    } catch (e) {
      console.log(e)
    }
  }

  async endGame(gameId: UUID) {
    try {
      const roundResult = this.gameService.getRoundResult(gameId)
      await this.gameService.endGame(gameId)

      return { roundResult }
    } catch (e) {
      console.log(e)
    }
  }
}
