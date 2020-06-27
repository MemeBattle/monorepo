import { injectable, inject } from 'inversify'
import { Socket } from 'socket.io'
import { Controller } from './controller'
import {
  GameplayTypes,
  updateGameAction,
  StartGameEmitAction,
  PutCardAction,
  TakeFromLigrettoDeckAction,
  TakeFromStackDeckAction,
  PutCardFromStackOpenDeck,
} from '@memebattle/ligretto-shared'
import { TYPES } from '../types'
import { Gameplay } from '../gameplay/gameplay'
import { GameService } from '../entities/game/game.service'

@injectable()
export class GameplayController extends Controller {
  @inject(TYPES.Gameplay) private gameplay: Gameplay
  @inject(TYPES.GameService) private gameService: GameService

  handlers = {
    [GameplayTypes.START_GAME]: (socket, action) => this.startGame(socket, action),
    [GameplayTypes.END_GAME]: (socket: Socket, action) => this.endGame(socket, action),
    [GameplayTypes.PUT_CARD]: (socket: Socket, action) => this.putCard(socket, action),
    [GameplayTypes.TAKE_FROM_LIGRETTO_DECK]: (socket: Socket, action) => this.takeCardFromLigrettoDeck(socket, action),
    [GameplayTypes.PUT_CARD_FROM_STACK_OPEN_DECK]: (socket: Socket, action) => this.putCardFromStackOpenDeck(socket, action),
    [GameplayTypes.TAKE_FROM_STACK_DECK]: (socket: Socket, action) => this.takeCardFromStackDeck(socket, action),
  }

  private async updateGame(socket: Socket, gameId: string) {
    const game = await this.gameService.getGame(gameId)
    const action = updateGameAction(game)
    socket.to(gameId).emit('event', action)
    socket.emit('event', action)
  }

  private async startGame(socket: Socket, action: StartGameEmitAction) {
    const gameId = action.payload.gameId

    await this.gameplay.startGame(gameId)

    await this.updateGame(socket, gameId)
  }

  private async endGame(socket: Socket, action) {
    const gameId = action.payload.gameId

    const results = await this.gameplay.endGame(gameId)

    socket.to(gameId).emit('event', results)
  }

  private async putCard(socket: Socket, action: PutCardAction) {
    const { gameId, cardIndex } = action.payload

    await this.gameplay.playerPutCard(gameId, socket.id, cardIndex)
    await this.updateGame(socket, gameId)
  }

  private async takeCardFromLigrettoDeck(socket: Socket, action: TakeFromLigrettoDeckAction) {
    const { gameId } = action.payload

    await this.gameplay.playerTakeFromLigrettoDeck(gameId, socket.id)
    await this.updateGame(socket, gameId)
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
