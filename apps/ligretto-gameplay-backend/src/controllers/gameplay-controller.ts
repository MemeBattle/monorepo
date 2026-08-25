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
import { wait } from '../utils/wait'
import type { UserService } from '../entities/user'
import type { GameOperationSerializer } from '../services/game-operation-serializer'

@injectable()
export class GameplayController extends Controller {
  @inject(IOC_TYPES.Gameplay) private gameplay: Gameplay
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.UserService) private userService: UserService
  @inject(IOC_TYPES.GameOperationSerializer) private gameOperations: GameOperationSerializer

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
    await this.gameOperations.run(gameId, async () => {
      const [game, user] = await Promise.all([this.gameService.getGame(gameId), this.userService.getUser(socket.data.userId)])
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

      const startingGame = await this.gameService.initiateStartGame(gameId)
      await this.updateGame(socket, gameId, startingGame)
      await Promise.all([this.gameplay.startGame(gameId), wait(game.config.startingDelayInSec * 1000)])
      await this.updateGame(socket, gameId)
    })
  }

  private async resumeGame(socket: Socket, action: ReturnType<typeof resumeGameEmitAction>) {
    const gameId = action.payload.gameId
    const resumedGame = await this.gameOperations.run(gameId, async () => {
      const game = await this.gameService.getGame(gameId)
      if (!game || !game.players[socket.data.userId]?.isHost) {
        return undefined
      }
      return this.gameService.resumeGame(gameId, socket.data.userId)
    })
    if (!resumedGame) {
      return
    }

    await this.updateGame(socket, gameId)
  }

  private async updateGame(socket: Socket, gameId: string, gameState?: Game) {
    const game = gameState || (await this.gameService.getGame(gameId))

    const action = updateGameAction(game)

    socket.to(gameId).emit('event', action)
    socket.emit('event', action)
  }

  private async putCard(socket: Socket, action: ReturnType<typeof putCardAction>) {
    const { gameId, cardIndex, playgroundDeckIndex } = action.payload

    const mutated = await this.gameOperations.run(gameId, async () => {
      if (!(await this.canMutateGameplay(socket, gameId))) {
        return false
      }
      await this.gameplay.playerPutCard(gameId, socket.data.userId, cardIndex, playgroundDeckIndex)
      return true
    })
    if (!mutated) {
      return
    }
    await this.updateGame(socket, gameId)
  }

  private async takeCardFromLigrettoDeck(socket: Socket, action: ReturnType<typeof takeFromLigrettoDeckAction>) {
    const { gameId } = action.payload

    const result = await this.gameOperations.run(gameId, async () => {
      if (!(await this.canMutateGameplay(socket, gameId))) {
        return undefined
      }
      return this.gameplay.playerTakeFromLigrettoDeck(gameId, socket.data.userId)
    })
    if (!result) {
      return
    }
    const { game, gameResults } = result

    await this.updateGame(socket, gameId, game)

    console.log('gameResults', gameResults)
    if (gameResults) {
      const action = endRoundAction(gameResults)
      socket.to(gameId).emit('event', action)
      socket.emit('event', action)
    }
  }

  private async takeCardFromStackDeck(socket: Socket, action: ReturnType<typeof takeFromStackDeckAction>) {
    const { gameId } = action.payload

    const mutated = await this.gameOperations.run(gameId, async () => {
      if (!(await this.canMutateGameplay(socket, gameId))) {
        return false
      }
      console.log('takeCardFromStackDeck', action)
      await this.gameplay.playerTakeFromStackDeck(gameId, socket.data.userId)
      return true
    })
    if (!mutated) {
      return
    }
    await this.updateGame(socket, gameId)
  }

  private async putCardFromStackOpenDeck(socket: Socket, action: ReturnType<typeof putCardFromStackOpenDeck>) {
    const { gameId, playgroundDeckIndex } = action.payload
    const mutated = await this.gameOperations.run(gameId, async () => {
      if (!(await this.canMutateGameplay(socket, gameId))) {
        return false
      }
      console.log('putCardFromStackOpenDeck', action)
      await this.gameplay.playerPutFromStackOpenDeck(gameId, socket.data.userId, playgroundDeckIndex)
      return true
    })
    if (!mutated) {
      return
    }
    await this.updateGame(socket, gameId)
  }

  private async canMutateGameplay(socket: Socket, gameId: string) {
    const [game, user] = await Promise.all([this.gameService.getGame(gameId), this.userService.getUser(socket.data.userId)])
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
