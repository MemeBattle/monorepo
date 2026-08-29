import { beforeEach, describe, expect, it } from 'vitest'
import {
  CardColors,
  GameStatus,
  PlayerStatus,
  resumeGameEmitAction,
  startGameEmitAction,
  updateGameAction,
  type Game,
} from '@memebattle/ligretto-shared'

import type { GameplayController } from '../gameplay-controller'
import { createIOC } from '../../inversify.config'
import { IOC_TYPES } from '../../IOC_TYPES'
import type { Database } from '../../database'
import { createSocketMockImpl } from '../../../test/utils'
import type { AnyAction } from '../../types/any-action'

const pausedGame: Game = {
  id: 'paused-game',
  name: 'Paused game',
  status: GameStatus.Pause,
  players: {
    player: {
      id: 'player',
      isHost: true,
      status: PlayerStatus.InGame,
      cards: [{ color: CardColors.red, value: 4, playerId: 'player' }],
      ligrettoDeck: {
        isHidden: true,
        cards: [{ color: CardColors.blue, value: 7, playerId: 'player' }],
      },
      stackOpenDeck: {
        isHidden: false,
        cards: [{ color: CardColors.green, value: 3, playerId: 'player' }],
      },
      stackDeck: {
        isHidden: true,
        cards: [{ color: CardColors.yellow, value: 9, playerId: 'player' }],
      },
    },
  },
  spectators: { spectator: { id: 'spectator' } },
  playground: {
    decks: [{ isHidden: false, cards: [{ color: CardColors.red, value: 1, playerId: 'player' }] }],
    droppedDecks: [{ isHidden: false, cards: [{ color: CardColors.blue, value: 2, playerId: 'player' }] }],
  },
  config: {
    startingDelayInSec: 4,
    playersMaxCount: 4,
    dndEnabled: false,
    maxCardsOnTable: 12,
  },
}

describe('Gameplay Controller', () => {
  let gameplayController: GameplayController
  let database: Database
  let socket = createSocketMockImpl()

  beforeEach(async () => {
    const container = createIOC()
    gameplayController = container.get(IOC_TYPES.GameplayController)
    database = container.get(IOC_TYPES.Database)
    socket = createSocketMockImpl({ data: { user: { id: 'player' } } })

    await database.set(storage => {
      storage.games[pausedGame.id] = structuredClone(pausedGame)
    })
  })

  it('resumes a paused game without changing its in-progress state', async () => {
    await gameplayController.handleMessage(socket, resumeGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const resumedGame = await database.get(storage => storage.games[pausedGame.id])
    const expectedGame = { ...pausedGame, status: GameStatus.InGame }

    expect(resumedGame).toEqual(expectedGame)
    expect(socket.to).toHaveBeenCalledWith(pausedGame.id)
    expect(socket.emit).toHaveBeenCalledWith('event', updateGameAction(expectedGame))
  })

  it('does not allow a non-host socket to resume a paused game', async () => {
    const nonHostSocket = createSocketMockImpl({ data: { user: { id: 'spectator' } } })

    await gameplayController.handleMessage(nonHostSocket, resumeGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game).toEqual(pausedGame)
    expect(nonHostSocket.to).not.toHaveBeenCalled()
    expect(nonHostSocket.emit).not.toHaveBeenCalled()
  })

  it('ignores a resume action for an unknown game', async () => {
    const gamesBefore = await database.get(storage => structuredClone(storage.games))

    await gameplayController.handleMessage(socket, resumeGameEmitAction({ gameId: 'unknown-game' }) as AnyAction)

    const gamesAfter = await database.get(storage => storage.games)
    expect(gamesAfter).toEqual(gamesBefore)
    expect(socket.to).not.toHaveBeenCalled()
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('does not change a game that is not paused', async () => {
    const activeGame = { ...pausedGame, status: GameStatus.New }
    await database.set(storage => {
      storage.games[pausedGame.id] = structuredClone(activeGame)
    })

    await gameplayController.handleMessage(socket, resumeGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game).toEqual(activeGame)
  })

  it('keeps the start action on the fresh-round initialization path', async () => {
    const newGame = {
      ...pausedGame,
      status: GameStatus.New,
      config: { ...pausedGame.config, startingDelayInSec: 0 },
    }
    await database.set(storage => {
      storage.games[pausedGame.id] = structuredClone(newGame)
    })

    await gameplayController.handleMessage(socket, startGameEmitAction({ gameId: pausedGame.id }) as AnyAction)

    const game = await database.get(storage => storage.games[pausedGame.id])
    expect(game.status).toBe(GameStatus.InGame)
    expect(game.players.player?.cards).not.toEqual(pausedGame.players.player?.cards)
    expect(game.playground).toEqual({ decks: new Array(pausedGame.config.maxCardsOnTable).fill(null), droppedDecks: [] })
  })
})
