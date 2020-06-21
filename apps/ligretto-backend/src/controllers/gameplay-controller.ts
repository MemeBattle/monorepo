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
import { GameplayOutput } from '../gameplay/gameplay-output'

@injectable()
export class GameplayController extends Controller {
  @inject(TYPES.Gameplay) private gameplay: Gameplay
  @inject(TYPES.GameplayOutput) private gameplayOutput: GameplayOutput

  handlers = {
    [GameplayTypes.START_GAME]: (socket, action) => this.startGame(socket, action),
    [GameplayTypes.END_GAME]: (socket: Socket, action) => this.endGame(socket, action),
    [GameplayTypes.PUT_CARD]: (socket: Socket, action) => this.putCard(socket, action),
    [GameplayTypes.TAKE_FROM_LIGRETTO_DECK]: (socket: Socket, action) => this.takeCardFromLigrettoDeck(socket, action),
    [GameplayTypes.PUT_CARD_FROM_STACK_OPEN_DECK]: (socket: Socket, action) => this.putCardFromStackOpenDeck(socket, action),
    [GameplayTypes.TAKE_FROM_STACK_DECK]: (socket: Socket, action) => this.takeCardFromStackDeck(socket, action),
  }

  private async startGame(socket: Socket, action: StartGameEmitAction) {
    const gameId = action.payload.gameId

    this.gameplayOutput.listenGame(gameId, game => {
      console.log('updateGame', game)
      const action = updateGameAction(game)
      socket.to(gameId).emit('event', action)
      socket.emit('event', action)
    })

    await this.gameplay.startGame(gameId)
  }

  private async endGame(socket: Socket, action) {
    const gameId = action.payload.gameId

    this.gameplayOutput.unlistenGame(action.payload.gameId)
    const results = await this.gameplay.endGame(gameId)

    socket.to(gameId).emit('event', results)
  }

  private async putCard(socket: Socket, action: PutCardAction) {
    const { gameId, cardIndex } = action.payload

    await this.gameplay.playerPutCard(gameId, socket.id, cardIndex)
  }

  private async takeCardFromLigrettoDeck(socket: Socket, action: TakeFromLigrettoDeckAction) {
    const { gameId } = action.payload

    await this.gameplay.playerTakeFromLigrettoDeck(gameId, socket.id)
  }

  private async takeCardFromStackDeck(socket: Socket, action: TakeFromStackDeckAction) {
    const { gameId } = action.payload

    console.log('takeCardFromStackDeck', action)
    await this.gameplay.playerTakeFromStackDeck(gameId, socket.id)
  }

  private async putCardFromStackOpenDeck(socket: Socket, action: PutCardFromStackOpenDeck) {
    const { gameId } = action.payload
    console.log('putCardFromStackOpenDeck', action)
    await this.gameplay.playerPutFromStackOpenDeck(gameId, socket.id)
  }
}
