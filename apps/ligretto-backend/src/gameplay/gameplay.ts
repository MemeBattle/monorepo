import { inject, injectable } from 'inversify'
import { PlayerService } from '../entities/player/player.service'
import { PlaygroundService } from '../entities/playground'
import { GameService } from '../entities/game/game.service'
import { IOC_TYPES } from '../IOC_TYPES'
import { GameplayOutput } from './gameplay-output'
import { Game } from '@memebattle/ligretto-shared'

@injectable()
export class Gameplay {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.PlayerService) private playerService: PlayerService
  @inject(IOC_TYPES.PlaygroundService) private playgroundService: PlaygroundService
  @inject(IOC_TYPES.GameplayOutput) private gameplayOutput: GameplayOutput

  async startGame(gameId: string) {
    try {
      await this.gameService.startGame(gameId)
    } catch (e) {
      console.log(e)
    }
  }

  async playerPutCard(gameId: string, playerColor: string, cardPosition: number, deckPosition?: number) {
    try {
      const card = await this.playerService.getCard(gameId, playerColor, cardPosition)
      if (!card) {
        return
      }

      const finalDeckPosition = await this.playgroundService.checkOrCreateDeck(gameId, card, deckPosition)
      if (finalDeckPosition === undefined || finalDeckPosition === -1) {
        return
      }

      await this.playgroundService.putCard(gameId, card, finalDeckPosition)
      await this.playerService.removeCard(gameId, playerColor, cardPosition)
    } catch (e) {
      console.log(e)
    }
  }

  async playerPutFromStackOpenDeck(gameId: string, playerColor: string, deckPosition?: number) {
    try {
      const card = await this.playerService.getCardFromStackOpenDeck(gameId, playerColor)
      if (!card) {
        return
      }
      const finalDeckPosition = await this.playgroundService.checkOrCreateDeck(gameId, card, deckPosition)

      if (finalDeckPosition === -1 || finalDeckPosition === undefined) {
        return
      }

      await this.playgroundService.putCard(gameId, card, finalDeckPosition)
      await this.playerService.removeCardFromStackOpenDeck(gameId, playerColor)
    } catch (e) {
      console.log(e)
    }
  }

  async playerTakeFromLigrettoDeck(gameId: string, playerColor: string): Promise<[Game, Record<string, number> | null]> {
    try {
      const remaining = await this.playerService.takeFromLigrettoDeck(gameId, playerColor)

      if (remaining === 0) {
        return this.gameService.endRound(gameId)
      }

      const game = await this.gameService.getGame(gameId)
      return [game, null]
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

      return { results }
    } catch (e) {
      console.log(e)
    }
  }
}
