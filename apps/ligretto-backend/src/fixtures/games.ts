import { Game } from '../types/game'

export const createGame = () => {
  const game: Game = {
    name: 'Супер игра',
    players: {},
    playground: {
      decks: [],
    },
    config: {
      cardsCount: 10,
    },
  }
  return game
}
