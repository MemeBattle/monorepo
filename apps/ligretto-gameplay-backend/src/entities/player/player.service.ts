import { inject, injectable } from 'inversify'
import { last, shuffle } from 'lodash'
import { PlayerRepository } from './player.repo'
import type { Card, UUID } from '@memebattle/ligretto-shared'
import { IOC_TYPES } from '../../IOC_TYPES'

@injectable()
export class PlayerService {
  @inject(IOC_TYPES.PlayerRepository) private playerRepository: PlayerRepository

  async getPlayer(gameId: UUID, playerId: UUID) {
    return await this.playerRepository.getPlayer(gameId, playerId)
  }

  async getCard(gameId: UUID, playerId: UUID, position: number) {
    return await this.playerRepository.getCard(gameId, playerId, position)
  }

  async addCard(gameId: UUID, playerId: UUID, card: Card) {
    const cards = await this.playerRepository.getCards(gameId, playerId)

    const emptyCardIndex = cards?.findIndex(card => card === null)

    if (emptyCardIndex !== undefined && emptyCardIndex !== -1) {
      await this.playerRepository.addCard(gameId, playerId, card, emptyCardIndex)
    }
  }

  async removeCard(gameId: UUID, playerId: UUID, position: number) {
    await this.playerRepository.removeCard(gameId, playerId, position)

    return undefined
  }

  async removeCardFromLigrettoDeck(gameId: UUID, playerId: UUID) {
    return this.playerRepository.removeCardFromLigrettoDeck(gameId, playerId)
  }

  async removeCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    await this.playerRepository.removeCardFromStackOpenDeck(gameId, playerId)
    return await this.getCardFromStackOpenDeck(gameId, playerId)
  }

  async getCardFromStackOpenDeck(gameId: UUID, playerId: UUID) {
    const deck = await this.playerRepository.getStackOpenDeck(gameId, playerId)

    return last(deck?.cards)
  }

  async shuffleStackDeck(gameId: UUID, playerId: UUID) {
    const stackOpenDeck = await this.playerRepository.getStackOpenDeck(gameId, playerId)
    const stackDeck = await this.playerRepository.getStackDeck(gameId, playerId)

    if (stackDeck?.cards.length !== 0) {
      return
    }

    await this.playerRepository.updateStackDeck(gameId, playerId, stackDeck => ({
      ...stackDeck,
      cards: shuffle(stackOpenDeck?.cards),
    }))

    await this.playerRepository.updateStackOpenDeck(gameId, playerId, stackOpenDeck => ({
      ...stackOpenDeck,
      cards: [],
    }))
  }

  async takeFromStackDeck(gameId: UUID, playerId: UUID) {
    const stackDeck = await this.playerRepository.getStackDeck(gameId, playerId)
    if (stackDeck?.cards.length === 0) {
      await this.shuffleStackDeck(gameId, playerId)
    }

    let cards: Card[] = []

    await this.playerRepository.updateStackDeck(gameId, playerId, stackDeck => {
      cards = stackDeck.cards.slice(-3)

      return {
        isHidden: stackDeck.cards.slice(0, -3).length !== 0,
        cards: stackDeck.cards.slice(0, -3),
      }
    })

    await this.playerRepository.updateStackOpenDeck(gameId, playerId, stackOpenDeck => ({
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
  async takeFromLigrettoDeck(gameId: UUID, playerId: string) {
    const cards = await this.playerRepository.getCards(gameId, playerId)
    const ligrettoDeck = await this.playerRepository.getLigrettoDeck(gameId, playerId)

    const emptyCardIndex = cards?.findIndex(card => card === null)
    if (emptyCardIndex === -1) {
      return ligrettoDeck?.cards.length
    }

    const card = last(ligrettoDeck?.cards)

    if (!card) {
      return
    }

    await this.addCard(gameId, playerId, card)
    return await this.removeCardFromLigrettoDeck(gameId, playerId)
  }
}
