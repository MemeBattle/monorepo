import { inject, injectable } from 'inversify'
import { last, shuffle } from 'lodash'
import type { PlayerRepository } from './player.repo'
import type { Card, UUID } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlayerService {
  @inject(IOC_TYPES.PlayerRepository) private playerRepository: PlayerRepository

  getPlayer(gameId: UUID, playerId: UUID) {
    return this.playerRepository.getPlayer(gameId, playerId)
  }

  getCard(gameId: UUID, playerId: UUID, position: number) {
    return this.playerRepository.getCard(gameId, playerId, position)
  }

  addCard(gameId: UUID, playerId: UUID, card: Card) {
    const cards = this.playerRepository.getCards(gameId, playerId)

    const emptyCardIndex = cards?.findIndex(card => card === null)

    if (emptyCardIndex !== undefined && emptyCardIndex !== -1) {
      this.playerRepository.addCard(gameId, playerId, card, emptyCardIndex)
    }
  }

  removeCard(gameId: UUID, playerId: UUID, position: number) {
    this.playerRepository.removeCard(gameId, playerId, position)

    return undefined
  }

  removeCardFromLigrettoDeck(gameId: UUID, playerId: UUID) {
    return this.playerRepository.removeCardFromLigrettoDeck(gameId, playerId)
  }

  removeCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    this.playerRepository.removeCardFromStackOpenDeck(gameId, playerId)
    return this.getCardFromStackOpenDeck(gameId, playerId)
  }

  getCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    const deck = this.playerRepository.getStackOpenDeck(gameId, playerId)

    return last(deck?.cards)
  }

  shuffleStackDeck(gameId: UUID, playerId: UUID) {
    const stackOpenDeck = this.playerRepository.getStackOpenDeck(gameId, playerId)
    const stackDeck = this.playerRepository.getStackDeck(gameId, playerId)

    if (stackDeck?.cards.length !== 0) {
      return
    }

    this.playerRepository.updateStackDeck(gameId, playerId, stackDeck => ({
      ...stackDeck,
      cards: shuffle(stackOpenDeck?.cards),
    }))

    this.playerRepository.updateStackOpenDeck(gameId, playerId, stackOpenDeck => ({
      ...stackOpenDeck,
      cards: [],
    }))
  }

  takeFromStackDeck(gameId: UUID, playerId: UUID) {
    const stackDeck = this.playerRepository.getStackDeck(gameId, playerId)
    if (stackDeck?.cards.length === 0) {
      this.shuffleStackDeck(gameId, playerId)
    }

    let cards: Card[] = []

    this.playerRepository.updateStackDeck(gameId, playerId, stackDeck => {
      cards = stackDeck.cards.slice(-3)

      return {
        isHidden: stackDeck.cards.slice(0, -3).length !== 0,
        cards: stackDeck.cards.slice(0, -3),
      }
    })

    this.playerRepository.updateStackOpenDeck(gameId, playerId, stackOpenDeck => ({
      ...stackOpenDeck,
      cards: stackOpenDeck.cards.concat(cards),
    }))
  }

  /**
   * We get an array of cards (3 cards) on the user's board.
   * We get cards from the ligretto deck.
   * Check for the presence of empty user cards on the board.
   * If the user has empty cards, reduce the number of cards in the ligretto deck
   * @param gameId
   * @param playerId
   */
  takeFromLigrettoDeck(gameId: UUID, playerId: string) {
    const cards = this.playerRepository.getCards(gameId, playerId)
    const ligrettoDeck = this.playerRepository.getLigrettoDeck(gameId, playerId)

    const emptyCardIndex = cards?.findIndex(card => card === null)
    if (emptyCardIndex === -1) {
      return ligrettoDeck?.cards.length
    }

    const card = last(ligrettoDeck?.cards)

    if (!card) {
      return
    }

    this.addCard(gameId, playerId, card)
    return this.removeCardFromLigrettoDeck(gameId, playerId)
  }
}
