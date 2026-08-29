import { inject, injectable } from 'inversify'
import { IOC_TYPES } from '../IOC_TYPES'
import { Controller } from './controller'
import type { Socket } from 'socket.io'
import type { GameService } from '../entities/game/game.service'
import type { UserService } from '../entities/user'
import type { Game } from '@memebattle/ligretto-shared'
import {
  connectToRoomEmitAction,
  connectToRoomErrorAction,
  connectToRoomSuccessAction,
  createRoomEmitAction,
  createRoomErrorAction,
  CreateRoomErrorCode,
  createRoomSuccessAction,
  endRoundAction,
  GameStatus,
  PlayerStatus,
  leaveFromRoomEmitAction,
  removeRoomAction,
  getRoomsEmitAction,
  setPlayerStatusEmitAction,
  updateGameAction,
  updateRoomsAction,
  userJoinToRoomAction,
} from '@memebattle/ligretto-shared'
import { SOCKET_ROOM_LOBBY } from '../config'
import { gameToRoom } from '../utils/mappers'
import type { GameConnectionService } from '../services/game-connection/game-connection.service'

@injectable()
export class GamesController extends Controller {
  @inject(IOC_TYPES.GameService) private gameService: GameService
  @inject(IOC_TYPES.UserService) private userService: UserService
  @inject(IOC_TYPES.GameConnectionService) private gameConnectionService: GameConnectionService

  protected handlers: Controller['handlers'] = {
    [createRoomEmitAction.type]: (socket, action) => this.createGame(socket, action),
    [getRoomsEmitAction.type]: socket => this.getRooms(socket),
    [connectToRoomEmitAction.type]: (socket, action) => this.joinGame(socket, action),
    [setPlayerStatusEmitAction.type]: (socket, action) => this.setPlayerStatus(socket, action),
    [leaveFromRoomEmitAction.type]: socket => this.leaveFromRoomHandler(socket),
  }

  private async createGame(socket: Socket, action: ReturnType<typeof createRoomEmitAction>) {
    const newGame = await this.gameService.createGame(action.payload.name, action.payload.config)

    if (!newGame) {
      return socket.emit('event', createRoomErrorAction({ errorCode: CreateRoomErrorCode.AlreadyExist, name: action.payload.name }))
    }

    socket.emit('event', createRoomSuccessAction({ game: newGame }))
    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(newGame)] }))
  }

  private getRooms(socket: Socket) {
    socket.join(SOCKET_ROOM_LOBBY)
    const games = this.gameService.getGames()
    socket.emit('event', updateRoomsAction({ rooms: games.map(gameToRoom) }))
  }

  /**
   * Connect to room handler.
   * Add socket to room. Leave from lobby
   * Notify players in room about new player
   * Notify new player about players in room
   *
   * read more: https://miro.com/app/board/o9J_l6Vx4-Q=/?moveToWidget=3458764530187757883&cot=14
   */
  private joinGame(socket: Socket, action: ReturnType<typeof connectToRoomEmitAction>) {
    const roomUuid = action.payload.roomUuid
    const userId = socket.data.userId
    const game: Game | undefined = this.gameService.getGame(roomUuid)

    if (!game) {
      this.clearStaleAssociation(userId, roomUuid)
      socket.emit('event', connectToRoomErrorAction())
      return
    }

    const isUserAlreadyPlayer = !!game.players[userId]
    const isUserAlreadySpectator = !!game.spectators[userId]
    const isUserAlreadyInGame = isUserAlreadyPlayer || isUserAlreadySpectator

    if (isUserAlreadyInGame) {
      // The association is an authorization input for every mutating handler,
      // so a rejoin must restore it (the user may have visited another room
      // in between).
      this.userService.joinGame({ userId, gameId: roomUuid })
      this.gameConnectionService.reconnected(roomUuid, userId, this.lifecycleEvents(socket))
      // Reconnection may have restored the player's status or transferred the
      // host, so broadcast the canonical state, not the pre-reconnect snapshot.
      const synchronizedGame = this.gameService.getGame(roomUuid)
      socket.join(roomUuid)
      socket.leave(SOCKET_ROOM_LOBBY)
      socket.emit('event', connectToRoomSuccessAction({ game: synchronizedGame }))
      socket.emit('event', updateGameAction(synchronizedGame))
      this.emitLastRoundResults(socket, roomUuid)
      socket.to(roomUuid).emit('event', updateGameAction(synchronizedGame))
      return
    }

    this.userService.joinGame({ userId, gameId: roomUuid })

    const isGameFull = Object.keys(game.players).length >= game.config.playersMaxCount
    // A paused game is a round in progress: a newcomer has no cards in it, so
    // they join as a spectator, exactly as they would while the round runs.
    const joinsAsSpectator = isGameFull || game.status === GameStatus.InGame || game.status === GameStatus.Pause

    const { game: updatedGame } = joinsAsSpectator
      ? this.gameService.addSpectator(roomUuid, { id: userId })
      : this.gameService.addPlayer(roomUuid, { id: userId })

    socket.join(roomUuid)
    socket.leave(SOCKET_ROOM_LOBBY)

    socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(updatedGame)] }))
    socket.to(roomUuid).emit('event', updateGameAction(updatedGame))
    socket.to(roomUuid).emit('event', userJoinToRoomAction({ userId }))
    socket.emit('event', connectToRoomSuccessAction({ game: updatedGame }))
    socket.emit('event', updateGameAction(updatedGame))
    this.emitLastRoundResults(socket, roomUuid)
  }

  /**
   * The endRound broadcast is ephemeral, so a client joining or rejoining the
   * room would otherwise render the scores table empty until the next round.
   */
  private emitLastRoundResults(socket: Socket, gameId: string) {
    const results = this.gameService.getLastRoundResults(gameId)
    if (results) {
      socket.emit('event', endRoundAction(results))
    }
  }

  private clearStaleAssociation(userId: string, gameId: string) {
    const user = this.userService.getUser(userId)
    if (user?.currentGameId === gameId) {
      this.userService.leaveGame(userId)
    }
  }

  private setPlayerStatus(socket: Socket, { payload }: ReturnType<typeof setPlayerStatusEmitAction>) {
    const { gameId, status } = payload

    if (status !== PlayerStatus.ReadyToPlay && status !== PlayerStatus.DontReadyToPlay) {
      return
    }

    const game = this.gameService.setPlayerStatusIfEligible(gameId, socket.data.userId, socket.id, status)
    if (!game) {
      return
    }

    socket.to(gameId).emit('event', updateGameAction(game))
    socket.emit('event', updateGameAction(game))
  }

  /**
   * LeaveFromRoomHandler
   *
   * read more: https://miro.com/app/board/o9J_l6Vx4-Q=/?moveToWidget=3458764530187757883&cot=14
   */
  private leaveFromRoomHandler(socket: Socket) {
    const user = this.userService.getUser(socket.data.userId)

    if (!user || !user.currentGameId) {
      return
    }

    this.gameConnectionService.explicitLeave(user.currentGameId, user.id)

    if (user.socketIds.length > 1) {
      socket.leave(user.currentGameId)
      return
    }

    const currentGameId = user.currentGameId
    this.userService.leaveGame(user.id)
    if (!this.gameService.getGame(currentGameId)) {
      return
    }
    const game = this.gameService.leaveGame(currentGameId, user.id)

    if (game) {
      socket.to(game.id).emit('event', updateGameAction(game))
      socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(game)] }))
      // The leaver may have been the last online player of a room whose
      // remaining players are all Disconnected; nothing else arms deletion.
      this.gameConnectionService.scheduleDeletionIfAbandoned(game.id, this.lifecycleEvents(socket))
    } else {
      socket.to(SOCKET_ROOM_LOBBY).emit('event', removeRoomAction({ uuid: currentGameId }))
    }
  }

  private lifecycleEvents(socket: Socket) {
    return {
      onUpdate: (game: Game) => {
        socket.to(game.id).emit('event', updateGameAction(game))
        socket.to(SOCKET_ROOM_LOBBY).emit('event', updateRoomsAction({ rooms: [gameToRoom(game)] }))
      },
      onDelete: (gameId: string) => socket.to(SOCKET_ROOM_LOBBY).emit('event', removeRoomAction({ uuid: gameId })),
    }
  }

  public disconnectionHandler(socket: Socket, reason = 'client namespace disconnect') {
    if (reason === 'client namespace disconnect') {
      return this.leaveFromRoomHandler(socket)
    }
    const user = this.userService.getUser(socket.data.userId)
    if (!user?.currentGameId || this.userService.hasLiveSockets(user.id)) {
      return
    }
    this.gameConnectionService.transportDisconnected(user.currentGameId, user.id, this.lifecycleEvents(socket))
  }
}
