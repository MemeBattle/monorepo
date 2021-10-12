import { injectable, inject } from 'inversify'
import type { Socket } from 'socket.io'
import { mapValues } from 'lodash'
import { Controller } from './controller'
import type { Game } from '@memebattle/ligretto-shared'
import {
  updateGameAction,
  endRoundAction,
  putCardAction,
  putCardFromStackOpenDeck,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
} from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../IOC_TYPES'
import { Gameplay } from '../gameplay/gameplay'
import { GameService } from '../entities/game/game.service'

@injectable()
export class GameplayController extends Controller {
  @inject(IOC_TYPES.Gameplay) private gameplay: Gameplay
  @inject(IOC_TYPES.GameService) private gameService: GameService

  handlers = {
    [startGameEmitAction.type]: (socket, action) => this.startGame(socket, action),
    [putCardAction.type]: (socket: Socket, action) => this.putCard(socket, action),
    [takeFromLigrettoDeckAction.type]: (socket: Socket, action) => this.takeCardFromLigrettoDeck(socket, action),
    [putCardFromStackOpenDeck.type]: (socket: Socket, action) => this.putCardFromStackOpenDeck(socket, action),
    [takeFromStackDeckAction.type]: (socket: Socket, action) => this.takeCardFromStackDeck(socket, action),
  }

  private async updateGame(socket: Socket, gameId: string, gameState?: Game) {
    const game = gameState || (await this.gameService.getGame(gameId))
    const action = updateGameAction(game)
    socket.to(gameId).emit('event', action)
    socket.emit('event', action)
  }

  private async startGame(socket: Socket, action: ReturnType<typeof startGameEmitAction>) {
    const gameId = action.payload.gameId

    await this.gameplay.startGame(gameId)

    await this.updateGame(socket, gameId)
  }

  private async putCard(socket: Socket, action: ReturnType<typeof putCardAction>) {
    const { gameId, cardIndex } = action.payload

    await this.gameplay.playerPutCard(gameId, socket.data.user.id, cardIndex)
    await this.updateGame(socket, gameId)
  }

  private async takeCardFromLigrettoDeck(socket: Socket, action: ReturnType<typeof takeFromLigrettoDeckAction>) {
    const { gameId } = action.payload

    const [game, roundResults] = await this.gameplay.playerTakeFromLigrettoDeck(gameId, socket.data.user.id)
    await this.updateGame(socket, gameId, game)
    console.log(roundResults)
    if (roundResults) {
      const action = endRoundAction(mapValues(roundResults, roundScore => ({ roundScore, gameScore: roundScore })))
      socket.to(gameId).emit('event', action)
      socket.emit('event', action)
    }
  }

  private async takeCardFromStackDeck(socket: Socket, action: ReturnType<typeof takeFromStackDeckAction>) {
    const { gameId } = action.payload

    console.log('takeCardFromStackDeck', action)
    await this.gameplay.playerTakeFromStackDeck(gameId, socket.data.user.id)
    await this.updateGame(socket, gameId)
  }

  private async putCardFromStackOpenDeck(socket: Socket, action: ReturnType<typeof putCardFromStackOpenDeck>) {
    const { gameId } = action.payload
    console.log('putCardFromStackOpenDeck', action)
    await this.gameplay.playerPutFromStackOpenDeck(gameId, socket.data.user.id)
    await this.updateGame(socket, gameId)
  }
}
