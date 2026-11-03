import { GameStatus, PlayerStatus, type Game as GameState, type Player } from '@memebattle/ligretto-shared'
import type { AnyAction } from '../actions'
import type { FakeConnection } from '../ports.fake'

/** Delivers to whatever is in the list at that moment. */
export const broadcastTo = (connections: FakeConnection[]) => (action: AnyAction, exceptUserId?: string) =>
  connections.filter(connection => connection.userId !== exceptUserId).forEach(connection => connection.send(action))

export const playerOf = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.InGame,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
  ...overrides,
})

/** A host and a peer in the middle of a round. */
export const gameInRound = (overrides: Partial<GameState> = {}): GameState => ({
  id: 'game',
  name: 'game',
  status: GameStatus.InGame,
  players: { host: playerOf('host', { isHost: true }), peer: playerOf('peer') },
  spectators: {},
  playground: { decks: new Array(12).fill(null), droppedDecks: [] },
  config: { playersMaxCount: 4, startingDelayInSec: 4, maxCardsOnTable: 12 },
  ...overrides,
})
