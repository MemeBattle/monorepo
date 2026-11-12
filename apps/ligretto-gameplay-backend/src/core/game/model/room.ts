import type { Game, Player, UUID } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'
import type { RoundToSave } from '../../ports'
import { dealHand, emptyTable, scoreOf } from './gameplay'

const DEFAULT_CONFIG: Game['config'] = { playersMaxCount: 4, startingDelayInSec: 4, maxCardsOnTable: 12 }

export const createGame = (id: UUID, name: string): Game => ({
  id,
  name,
  status: GameStatus.New,
  players: {},
  spectators: {},
  playground: { decks: [], droppedDecks: [] },
  config: DEFAULT_CONFIG,
})

export const createPlayer = (id: UUID, overrides: Partial<Player> = {}): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.DontReadyToPlay,
  stackDeck: { isHidden: true, cards: [] },
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: true, cards: [] },
  ...overrides,
})

export const playersOf = (game: Game) => Object.values(game.players).filter((player): player is Player => !!player)

export const onlinePlayersOf = (game: Game) => playersOf(game).filter(player => player.status !== PlayerStatus.Disconnected)

const isBetweenRounds = (game: Game) => game.status === GameStatus.New || game.status === GameStatus.RoundFinished

export const isRoundInProgress = (game: Game) =>
  game.status === GameStatus.Starting || game.status === GameStatus.InGame || game.status === GameStatus.Pause

const isOnlineHost = (game: Game, userId: UUID) => {
  const player = game.players[userId]
  return !!player?.isHost && player.status !== PlayerStatus.Disconnected
}

export const canStartRound = (game: Game, userId: UUID) => isBetweenRounds(game) && isOnlineHost(game, userId) && onlinePlayersOf(game).length >= 2

export const canResumeRound = (game: Game, userId: UUID) =>
  game.status === GameStatus.Pause && isOnlineHost(game, userId) && onlinePlayersOf(game).length >= 2

export const canSetReadiness = (game: Game, userId: UUID, status: PlayerStatus) => {
  const player = game.players[userId]
  return (
    isBetweenRounds(game) &&
    !!player &&
    player.status !== PlayerStatus.Disconnected &&
    (status === PlayerStatus.ReadyToPlay || status === PlayerStatus.DontReadyToPlay)
  )
}

const omit = <T>(record: Record<UUID, T>, key: UUID): Record<UUID, T> => Object.fromEntries(Object.entries(record).filter(([id]) => id !== key))

export const joinsAsSpectator = (game: Game) =>
  Object.keys(game.players).length >= game.config.playersMaxCount || game.status === GameStatus.InGame || game.status === GameStatus.Pause

export const addPlayer = (game: Game, userId: UUID): Game => ({
  ...game,
  players: { ...game.players, [userId]: createPlayer(userId, { isHost: Object.keys(game.players).length === 0 }) },
})

export const addSpectator = (game: Game, userId: UUID): Game => ({ ...game, spectators: { ...game.spectators, [userId]: { id: userId } } })

export const removeSpectator = (game: Game, userId: UUID): Game | undefined =>
  game.spectators[userId] ? { ...game, spectators: omit(game.spectators, userId) } : undefined

export const setPlayerStatus = (game: Game, userId: UUID, status: PlayerStatus): Game => {
  const player = game.players[userId]
  return player ? { ...game, players: { ...game.players, [userId]: { ...player, status } } } : game
}

export const beginStarting = (game: Game): Game => ({ ...game, status: GameStatus.Starting })

export const dealRound = (game: Game): Game => {
  const players = playersOf(game)
  return {
    ...game,
    status: GameStatus.InGame,
    players: Object.fromEntries(
      players.map(player => [
        player.id,
        {
          ...player,
          ...dealHand(player.id, players.length),
          // A disconnected player keeps their status through the deal, so the lifecycle still sees them as offline;
          // they have a hand to play with if they return mid-round.
          status: player.status === PlayerStatus.Disconnected ? PlayerStatus.Disconnected : PlayerStatus.InGame,
        },
      ]),
    ),
    playground: emptyTable(game.config.maxCardsOnTable),
  }
}

export const resumeRound = (game: Game): Game => ({ ...game, status: GameStatus.InGame })

/** Only the current players score: the cards of someone who left stay on the table, and ligretto-core would refuse a round naming them with no score. */
export const scoreRound = (game: Game): RoundToSave['results'] =>
  playersOf(game).map(player => ({ playerId: player.id, score: scoreOf(game.playground, player) }))

/** The post-round transition: statuses reset, with Disconnected preserved, and the table cleared. */
export const closeRound = (game: Game): Game => ({
  ...game,
  players: Object.fromEntries(
    playersOf(game).map(player => [
      player.id,
      { ...player, status: player.status === PlayerStatus.Disconnected ? PlayerStatus.Disconnected : PlayerStatus.DontReadyToPlay },
    ]),
  ),
  playground: emptyTable(game.config.maxCardsOnTable),
})

export const withHost = (game: Game, hostId: UUID | undefined): Game => ({
  ...game,
  players: Object.fromEntries(playersOf(game).map(player => [player.id, { ...player, isHost: player.id === hostId }])),
})

/** An empty roster means the room is over; the caller deletes it. */
export const leaveRoom = (game: Game, userId: UUID): Game => {
  const isHostLeaving = !!game.players[userId]?.isHost
  const remaining: Game = { ...game, players: omit(game.players, userId), spectators: omit(game.spectators, userId) }
  // Prefer an online successor: a Disconnected host cannot start or resume anything.
  const withSuccessor = isHostLeaving ? withHost(remaining, (onlinePlayersOf(remaining)[0] ?? playersOf(remaining)[0])?.id) : remaining

  // Abandons the round rather than pausing it: newcomers join a paused game as spectators, so the online count could
  // never reach two again. RoundFinished lets the room refill and the host start a fresh round.
  const dropsBelowTwoOnline = (game.status === GameStatus.InGame || game.status === GameStatus.Pause) && onlinePlayersOf(withSuccessor).length < 2
  return dropsBelowTwoOnline ? closeRound({ ...withSuccessor, status: GameStatus.RoundFinished }) : withSuccessor
}

export const markPlayerDisconnected = (game: Game, userId: UUID): Game | undefined => {
  const player = game.players[userId]
  if (!player || player.status === PlayerStatus.Disconnected) {
    return undefined
  }
  const disconnected = setPlayerStatus(game, userId, PlayerStatus.Disconnected)
  const pauses = game.status === GameStatus.InGame && onlinePlayersOf(disconnected).length < 2
  return pauses ? { ...disconnected, status: GameStatus.Pause } : disconnected
}

/** During a round a returning player holds a hand; between rounds they say again whether they are ready. */
export const markPlayerConnected = (game: Game, userId: UUID): Game => {
  if (game.players[userId]?.status !== PlayerStatus.Disconnected) {
    return game
  }
  return setPlayerStatus(game, userId, isBetweenRounds(game) ? PlayerStatus.DontReadyToPlay : PlayerStatus.InGame)
}

const isHostOffline = (game: Game) => playersOf(game).some(player => player.isHost && player.status === PlayerStatus.Disconnected)

export const transferDisconnectedHost = (game: Game): Game | undefined => {
  const replacement = [...onlinePlayersOf(game)].sort((left, right) => left.id.localeCompare(right.id))[0]
  return isHostOffline(game) && replacement ? withHost(game, replacement.id) : undefined
}
