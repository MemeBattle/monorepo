import { injectable, inject } from 'inversify'
import type { Socket } from 'socket.io'
import { Controller } from './controller'
import type { Game } from '@memebattle/ligretto-shared'
import {
  GameStatus,
  PlayerStatus,
  updateGameAction,
  endRoundAction,
  putCardAction,
  putCardFromStackOpenDeck,
  resumeGameEmitAction,
  startGameEmitAction,
  takeFromLigrettoDeckAction,
  takeFromStackDeckAction,
} from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../IOC_TYPES'
import type { Gameplay } from '../gameplay/gameplay'
import type { GameService } from '../entities/game/game.service'
import type { UserService } from '../entities/user'
import { wait } from '../utils/wait'

@injectable()
export class GameplayController extends Controller {
  @inject(IOC_TYPES.Gameplay) private gameplay: Gameplay
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.UserService) private userService: UserService

  protected handlers: Controller['handlers'] = {
    [startGameEmitAction.type]: (socket, action: ReturnType<typeof startGameEmitAction>) => this.startGame(socket, action),
    [resumeGameEmitAction.type]: (socket, action: ReturnType<typeof resumeGameEmitAction>) => this.resumeGame(socket, action),
    [putCardAction.type]: (socket: Socket, action) => this.putCard(socket, action),
    [takeFromLigrettoDeckAction.type]: (socket: Socket, action) => this.takeCardFromLigrettoDeck(socket, action),
    [putCardFromStackOpenDeck.type]: (socket: Socket, action) => this.putCardFromStackOpenDeck(socket, action),
    [takeFromStackDeckAction.type]: (socket: Socket, action) => this.takeCardFromStackDeck(socket, action),
  }

  private async startGame(socket: Socket, action: ReturnType<typeof startGameEmitAction>) {
    const gameId = action.payload.gameId
    const game = this.gameService.getGame(gameId)
    const user = this.userService.getUser(socket.data.userId)
    const player = game?.players[socket.data.userId]
    const onlinePlayers = Object.values(game?.players ?? {}).filter(current => current?.status !== PlayerStatus.Disconnected)
    if (
      !game ||
      game.status !== GameStatus.New ||
      !player?.isHost ||
      player.status === PlayerStatus.Disconnected ||
      user?.currentGameId !== gameId ||
      !user.socketIds.includes(socket.id) ||
      onlinePlayers.length < 2
    ) {
      return
    }

    this.gameService.initiateStartGame(gameId)
    this.updateGame(socket, gameId)

    this.gameplay.startGame(gameId)
    await wait(game.config.startingDelayInSec * 1000)
    this.updateGame(socket, gameId)
  }

  private resumeGame(socket: Socket, action: ReturnType<typeof resumeGameEmitAction>) {
    const gameId = action.payload.gameId
    const game = this.gameService.getGame(gameId)

    if (!game || !game.players[socket.data.userId]?.isHost) {
      return
    }

    const resumedGame = this.gameService.resumeGame(gameId, socket.data.userId)
    if (!resumedGame) {
      return
    }

    this.updateGame(socket, gameId)
  }

  private updateGame(socket: Socket, gameId: string, gameState?: Game) {
    const game = gameState || this.gameService.getGame(gameId)

    const action = updateGameAction(game)

    socket.to(gameId).emit('event', action)
    socket.emit('event', action)
  }

  private putCard(socket: Socket, action: ReturnType<typeof putCardAction>) {
    const { gameId, cardIndex, playgroundDeckIndex } = action.payload

    if (!this.canMutateGameplay(socket, gameId)) {
      return
    }
    this.gameplay.playerPutCard(gameId, socket.data.userId, cardIndex, playgroundDeckIndex)
    this.updateGame(socket, gameId)
  }

  private async takeCardFromLigrettoDeck(socket: Socket, action: ReturnType<typeof takeFromLigrettoDeckAction>) {
    const { gameId } = action.payload

    if (!this.canMutateGameplay(socket, gameId)) {
      return
    }
    const { game, gameResults } = await this.gameplay.playerTakeFromLigrettoDeck(gameId, socket.data.userId)

    this.updateGame(socket, gameId, game)

    console.log('gameResults', gameResults)
    if (gameResults) {
      const action = endRoundAction(gameResults)
      socket.to(gameId).emit('event', action)
      socket.emit('event', action)
    }
  }

  private takeCardFromStackDeck(socket: Socket, action: ReturnType<typeof takeFromStackDeckAction>) {
    const { gameId } = action.payload

    if (!this.canMutateGameplay(socket, gameId)) {
      return
    }
    console.log('takeCardFromStackDeck', action)
    this.gameplay.playerTakeFromStackDeck(gameId, socket.data.userId)
    this.updateGame(socket, gameId)
  }

  private putCardFromStackOpenDeck(socket: Socket, action: ReturnType<typeof putCardFromStackOpenDeck>) {
    const { gameId, playgroundDeckIndex } = action.payload

    if (!this.canMutateGameplay(socket, gameId)) {
      return
    }
    console.log('putCardFromStackOpenDeck', action)
    this.gameplay.playerPutFromStackOpenDeck(gameId, socket.data.userId, playgroundDeckIndex)
    this.updateGame(socket, gameId)
  }

  private canMutateGameplay(socket: Socket, gameId: string) {
    const game = this.gameService.getGame(gameId)
    const user = this.userService.getUser(socket.data.userId)
    const player = game?.players[socket.data.userId]
    return (
      game?.status === GameStatus.InGame &&
      player?.status !== PlayerStatus.Disconnected &&
      !!player &&
      user?.currentGameId === gameId &&
      user.socketIds.includes(socket.id)
    )
  }
}
