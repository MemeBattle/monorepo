import { inject, injectable } from 'inversify'
import { PlayerService } from '../entities/player/player.service'
import { PlaygroundService } from '../entities/playground'
import { GameService } from '../entities/game/game.service'
import { TYPES } from '../types'

@injectable()
export class Gameplay {
  @inject(TYPES.GameService) private gameService: GameService
  @inject(TYPES.PlayerService) private playerService: PlayerService
  @inject(TYPES.PlaygroundService) private playgroundService: PlaygroundService

  async startGame(gameId: string) {
    try {
      await this.gameService.startGame(gameId)
    } catch (e) {
      console.log(e)
    }
  }

  async playerPutCard(gameId: string, playerColor: string, cardPosition: number, deckPosition: number) {
    try {
      const card = await this.playerService.getCard(gameId, playerColor, cardPosition)
      await this.playgroundService.putCard(gameId, deckPosition, card)
      await this.playerService.removeCard(gameId, playerColor, cardPosition)
    } catch (e) {
      console.log(e)
    }
  }

  async playerPutFromStackOpenDeck(gameId: string, playerColor: string, deckPosition: number) {
    try {
      const card = await this.playerService.getCardFromStackOpenDeck(gameId, playerColor)
      await this.playgroundService.putCard(gameId, deckPosition, card)
      await this.playerService.removeCardFromStackOpenDeck(gameId, playerColor)
    } catch (e) {
      console.log(e)
    }
  }

  async playerShuffleStackDeck(gameId: string, playerColor: string) {
    try {
      await this.playerService.shuffleStackDeck(gameId, playerColor)
    } catch (e) {
      console.log(e)
    }
  }

  async playerTakeFromLigrettoDeck(gameId: string, playerColor: string) {
    try {
      const remaining = await this.playerService.takeFromLigrettoDeck(gameId, playerColor)

      if (remaining === 0) {
        return this.endGame(gameId)
      }
    } catch (e) {
      console.log(e)
    }
  }
  async playerTakeFromStackDeck(gameId: string, playerColor: string) {
    try {
      await this.playerService.takeFromStackDeck(gameId, playerColor)
    } catch (e) {
      console.log(e)
    }
  }

  async endGame(gameId: string) {
    try {
      const results = await this.gameService.getResult(gameId)
      await this.gameService.endGame(gameId)

      return results
    } catch (e) {
      console.log(e)
    }
  }
}
