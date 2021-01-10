import { injectable, inject } from 'inversify'
import type { Socket } from 'socket.io'
import { mapValues } from 'lodash'
import { Controller } from './controller'
import type {
  StartGameEmitAction,
  PutCardAction,
  TakeFromLigrettoDeckAction,
  TakeFromStackDeckAction,
  PutCardFromStackOpenDeck,
  Game,
} from '@memebattle/ligretto-shared'
import { GameplayTypes, updateGameAction, endRoundAction } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../IOC_TYPES'
import type { Gameplay } from '../gameplay/gameplay'
import type { GameService } from '../entities/game/game.service'

@injectable()
export class GameplayController extends Controller {
  @inject(IOC_TYPES.Gameplay) private gameplay: Gameplay
  @inject(IOC_TYPES.GameService) private gameService: GameService

  handlers = {
    [GameplayTypes.START_GAME]: (socket, action) => this.startGame(socket, action),
    [GameplayTypes.PUT_CARD]: (socket: Socket, action) => this.putCard(socket, action),
    [GameplayTypes.TAKE_FROM_LIGRETTO_DECK]: (socket: Socket, action) => this.takeCardFromLigrettoDeck(socket, action),
    [GameplayTypes.PUT_CARD_FROM_STACK_OPEN_DECK]: (socket: Socket, action) => this.putCardFromStackOpenDeck(socket, action),
    [GameplayTypes.TAKE_FROM_STACK_DECK]: (socket: Socket, action) => this.takeCardFromStackDeck(socket, action),
  }

  private async updateGame(socket: Socket, gameId: string, gameState?: Game) {
    const game = gameState || (await this.gameService.getGame(gameId))
    const action = updateGameAction(game)
    socket.to(gameId).emit('event', action)
    socket.emit('event', action)
  }

  private async startGame(socket: Socket, action: StartGameEmitAction) {
    const gameId = action.payload.gameId

    await this.gameplay.startGame(gameId)

    await this.updateGame(socket, gameId)
  }

  private async putCard(socket: Socket, action: PutCardAction) {
    const { gameId, cardIndex } = action.payload

    await this.gameplay.playerPutCard(gameId, socket.id, cardIndex)
    await this.updateGame(socket, gameId)
  }

  private async takeCardFromLigrettoDeck(socket: Socket, action: TakeFromLigrettoDeckAction) {
    const { gameId } = action.payload

    const [game, roundResults] = await this.gameplay.playerTakeFromLigrettoDeck(gameId, socket.id)
    await this.updateGame(socket, gameId, game)
    console.log(roundResults)
    if (roundResults) {
      const action = endRoundAction(mapValues(roundResults, roundScore => ({ roundScore, gameScore: roundScore })))
      socket.to(gameId).emit('event', action)
      socket.emit('event', action)
    }
  }

  private async takeCardFromStackDeck(socket: Socket, action: TakeFromStackDeckAction) {
    const { gameId } = action.payload

    console.log('takeCardFromStackDeck', action)
    await this.gameplay.playerTakeFromStackDeck(gameId, socket.id)
    await this.updateGame(socket, gameId)
  }

  private async putCardFromStackOpenDeck(socket: Socket, action: PutCardFromStackOpenDeck) {
    const { gameId } = action.payload
    console.log('putCardFromStackOpenDeck', action)
    await this.gameplay.playerPutFromStackOpenDeck(gameId, socket.id)
    await this.updateGame(socket, gameId)
  }
}
