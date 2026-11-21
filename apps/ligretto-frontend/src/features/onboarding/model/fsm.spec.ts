import { describe, expect, it } from 'vitest'
import { CardColors } from '@memebattle/ligretto-shared'

import { OnboardingEvent, OnboardingStateMachine, OnboardingStep, ONBOARDING_HARDCODED_RESULTS, createOnboardingGame, getAllowedEvents } from './fsm'
import { ONBOARDING_SCRIPT } from './script'

const green = (value: number) => ({ value, color: CardColors.green })

const walkTo = async (fsm: OnboardingStateMachine, step: OnboardingStep) => {
  for (const { event, step: nextStep } of ONBOARDING_SCRIPT) {
    await fsm.transition(event)
    if (nextStep === step) {
      return
    }
  }
  throw new Error(`Step ${step} is not on the happy path`)
}

describe('OnboardingStateMachine', () => {
  it('walks the happy path from Opponents to Result', async () => {
    const fsm = new OnboardingStateMachine()
    expect(fsm.current).toBe(OnboardingStep.Opponents)

    for (const { event, step } of ONBOARDING_SCRIPT) {
      await fsm.transition(event)
      expect(fsm.current).toBe(step)
    }

    expect(fsm.context.data.results).toEqual(ONBOARDING_HARDCODED_RESULTS)
  })

  it('deals five ligretto cards with the green five before the yellow five and six', () => {
    const fsm = new OnboardingStateMachine()

    expect(fsm.context.data.game.players.id0.ligrettoDeck.cards).toEqual([
      { value: 5, color: CardColors.blue },
      { value: 1, color: CardColors.red },
      green(5),
      { value: 5, color: CardColors.yellow },
      { value: 6, color: CardColors.yellow },
    ])
  })

  it('moves cards to the playground while the user follows the script', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.LigrettoAvailableCard)

    const { game } = fsm.context.data
    expect(game.playground.decks[0]?.cards).toEqual([
      { value: 1, color: CardColors.blue },
      { value: 2, color: CardColors.blue },
      { value: 3, color: CardColors.blue },
    ])
    expect(game.players.id0.cards[0]).toEqual({ value: 4, color: CardColors.red })
    expect(game.players.id0.cards[1]).toBeNull()
  })

  it('builds the blue pile and the red one on the decks the player picked', async () => {
    const fsm = new OnboardingStateMachine()
    for (const { event, step } of ONBOARDING_SCRIPT) {
      const playgroundDeckIndex = event === OnboardingEvent.PutFirstCard ? 5 : event === OnboardingEvent.PutSecondCard ? 7 : undefined
      await fsm.transition(event, ...(playgroundDeckIndex === undefined ? [] : [playgroundDeckIndex]))
      if (step === OnboardingStep.OpponentTurn) {
        break
      }
    }

    const { decks } = fsm.context.data.game.playground
    expect(decks[5]?.cards).toEqual([
      { value: 1, color: CardColors.blue },
      { value: 2, color: CardColors.blue },
      { value: 3, color: CardColors.blue },
    ])
    expect(decks[7]?.cards).toEqual([{ value: 1, color: CardColors.red }])
    // The opponent opens its green pile on the first deck still free.
    expect(fsm.context.data.opponentPileIndex).toBe(0)
    expect(decks[0]?.cards).toEqual([{ value: 1, color: CardColors.green }])
    expect(decks[1]).toBeUndefined()
  })

  it('flips cards from the closed deck onto the open pile', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.GameStarted)

    const openDeck = () => fsm.context.data.game.players.id0.stackOpenDeck.cards
    const closedDeck = () => fsm.context.data.game.players.id0.stackDeck.cards

    // After the scripted steps one card is still face down and one lies open (the blue two went to the table).
    expect(closedDeck()).toEqual([{ value: 7, color: CardColors.red }])
    expect(openDeck()).toEqual([{ value: 9, color: CardColors.blue }])

    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStarted)
    expect(closedDeck()).toHaveLength(0)
    expect(openDeck()).toEqual([
      { value: 7, color: CardColors.red },
      { value: 9, color: CardColors.blue },
    ])
  })

  it('shows the cycled-info hint once when the closed deck is exhausted', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.GameStarted)

    const openDeck = () => fsm.context.data.game.players.id0.stackOpenDeck.cards
    const closedDeck = () => fsm.context.data.game.players.id0.stackDeck.cards

    // Flip the last face-down card.
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(closedDeck()).toHaveLength(0)

    // The closed deck is empty for the first time — the hint step is entered, the cards stay put.
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStartedCycledInfo)
    expect(openDeck()).toHaveLength(2)

    // Leaving the hint turns the open pile over into a fresh closed deck, in the original order.
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStarted)
    expect(closedDeck()).toEqual([
      { value: 9, color: CardColors.blue },
      { value: 7, color: CardColors.red },
    ])
    expect(openDeck()).toHaveLength(0)

    // Exhaust the deck again: the hint is not shown a second time, the pile just turns over.
    await fsm.transition(OnboardingEvent.NextStackCard)
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(closedDeck()).toHaveLength(0)
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStarted)
    expect(closedDeck()).toHaveLength(2)
    expect(openDeck()).toHaveLength(0)
  })

  it('plays the green sequence with the opponent up to the green five and ends the round with a ligretto card into the row', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.OpponentTurn)

    const { game } = fsm.context.data
    const player = game.players.id0
    // The opponent has opened the green deck with the green one.
    expect(game.playground.decks[2]?.cards).toEqual([green(1)])

    // Flipping the stack makes the opponent answer with the green two.
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.OpponentTurnSecondCard)
    expect(game.playground.decks[2]?.cards).toEqual([green(1), green(2)])

    // The player puts the green three from the row and the opponent answers with the green four.
    await fsm.transition(OnboardingEvent.PutThirdCard)
    expect(fsm.current).toBe(OnboardingStep.AdditionalLigrettoCard)
    expect(game.playground.decks[2]?.cards).toEqual([green(1), green(2), green(3), green(4)])
    expect(player.cards).toEqual([{ value: 4, color: CardColors.red }, null, null])

    // The green five from the ligretto deck goes into the slot the red one freed.
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.AdditionalRowCard)
    expect(player.cards[1]).toEqual(green(5))
    expect(player.ligrettoDeck.cards).toHaveLength(2)

    // ...and from the row onto the green four.
    await fsm.transition(OnboardingEvent.PutSecondCard)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    expect(game.playground.decks[2]?.cards).toEqual([green(1), green(2), green(3), green(4), green(5)])
    expect(player.cards).toEqual([{ value: 4, color: CardColors.red }, null, null])

    // The first ligretto card fills a free slot, but the deck is not empty yet — the round goes on.
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    expect(player.cards[1]).toEqual({ value: 5, color: CardColors.yellow })
    expect(player.ligrettoDeck.cards).toHaveLength(1)

    // The last ligretto card empties the deck and ends the round.
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.RoundEnd)
    expect(player.cards[2]).toEqual({ value: 6, color: CardColors.yellow })
    expect(player.ligrettoDeck.cards).toHaveLength(0)
  })

  it('plays the opponent green four and the green five onto the pile the opponent opened', async () => {
    const fsm = new OnboardingStateMachine()
    for (const { event, step } of ONBOARDING_SCRIPT) {
      const playgroundDeckIndex = event === OnboardingEvent.PutFirstCard ? 0 : event === OnboardingEvent.PutSecondCard ? 3 : undefined
      await fsm.transition(event, ...(playgroundDeckIndex === undefined ? [] : [playgroundDeckIndex]))
      if (step === OnboardingStep.FinalLigrettoCard) {
        break
      }
    }

    // Blue on the first deck and red on the fourth: the second deck is the first free one when the opponent moves.
    const { decks } = fsm.context.data.game.playground
    expect(fsm.context.data.opponentPileIndex).toBe(1)
    expect(decks[1]?.cards).toEqual([green(1), green(2), green(3), green(4), green(5)])
    expect(decks[3]?.cards).toEqual([{ value: 1, color: CardColors.red }])
    expect(decks[2]).toBeUndefined()
  })

  it.each([
    ['on the opponent turn', OnboardingStep.OpponentTurn],
    ['after the opponent plays the green two', OnboardingStep.OpponentTurnSecondCard],
  ])('takes the green five into the row %s and goes straight to playing it', async (_, step) => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, step)

    const player = () => fsm.context.data.game.players.id0
    // The second row slot was freed when the player put the red one on the playground.
    expect(player().cards[1]).toBeNull()
    expect(player().ligrettoDeck.cards).toHaveLength(3)

    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(step)
    expect(player().cards[1]).toEqual(green(5))
    expect(player().ligrettoDeck.cards).toHaveLength(2)

    // The row is full now — the move is not available anymore.
    expect(await fsm.tryTransition(OnboardingEvent.PutLigretto)).toBe(false)
    expect(player().ligrettoDeck.cards).toHaveLength(2)

    if (step === OnboardingStep.OpponentTurn) {
      await fsm.transition(OnboardingEvent.NextStackCard)
    }
    await fsm.transition(OnboardingEvent.PutThirdCard)
    expect(fsm.current).toBe(OnboardingStep.AdditionalRowCard)

    await fsm.transition(OnboardingEvent.PutSecondCard)
    await fsm.transition(OnboardingEvent.PutLigretto)
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.RoundEnd)
    expect(player().ligrettoDeck.cards).toHaveLength(0)
  })

  it('lets a yellow card into the free slot before the green five is played and ends the round on the last one', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.AdditionalRowCard)

    const player = () => fsm.context.data.game.players.id0
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.AdditionalRowCard)
    expect(player().cards).toEqual([{ value: 4, color: CardColors.red }, green(5), { value: 5, color: CardColors.yellow }])

    // The row is full: the last ligretto card waits until the green five frees its slot.
    expect(await fsm.tryTransition(OnboardingEvent.PutLigretto)).toBe(false)

    await fsm.transition(OnboardingEvent.PutSecondCard)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.RoundEnd)
    expect(player().cards[1]).toEqual({ value: 6, color: CardColors.yellow })
    expect(fsm.context.data.results).toEqual(ONBOARDING_HARDCODED_RESULTS)
  })

  it.each([
    ['skipped', false, OnboardingStep.AdditionalLigrettoCard],
    ['taken', true, OnboardingStep.AdditionalRowCard],
  ])('plays the green three from the cycled-stack hint with the optional move %s', async (_, isLigrettoTaken, expectedStep) => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.OpponentTurnSecondCard)
    if (isLigrettoTaken) {
      await fsm.transition(OnboardingEvent.PutLigretto)
    }
    while (fsm.current !== OnboardingStep.OpponentTurnCycledInfo) {
      await fsm.transition(OnboardingEvent.NextStackCard)
    }

    await fsm.transition(OnboardingEvent.PutThirdCard)
    expect(fsm.current).toBe(expectedStep)
    expect(fsm.context.data.game.playground.decks[2]?.cards).toEqual([green(1), green(2), green(3), green(4)])
  })

  it('fills results only when the ligretto deck is emptied and shows them after the round end', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.FinalLigrettoCard)
    expect(fsm.context.data.results).toBeUndefined()

    // One of the two remaining ligretto cards is put — the round is not over yet.
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    expect(fsm.context.data.results).toBeUndefined()

    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.RoundEnd)
    expect(fsm.context.data.results).toEqual(ONBOARDING_HARDCODED_RESULTS)

    await fsm.transition(OnboardingEvent.NextStep)
    expect(fsm.current).toBe(OnboardingStep.Result)
  })

  it('does not end the round while the last ligretto card has no free row slot to go to', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.FinalLigrettoCard)
    await fsm.transition(OnboardingEvent.PutLigretto)
    const player = fsm.context.data.game.players.id0
    player.cards[2] = { value: 7, color: CardColors.red }

    expect(await fsm.tryTransition(OnboardingEvent.PutLigretto)).toBe(false)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    expect(player.ligrettoDeck.cards).toHaveLength(1)
    expect(fsm.context.data.results).toBeUndefined()
  })

  it('keeps the finished board on the round end step until the player moves on', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.RoundEnd)
    const board = structuredClone(fsm.context.data.game)

    expect(await getAllowedEvents(fsm)).toEqual([OnboardingEvent.NextStep])
    for (const event of Object.values(OnboardingEvent).filter(event => event !== OnboardingEvent.NextStep)) {
      expect(await fsm.tryTransition(event)).toBe(false)
    }
    expect(fsm.current).toBe(OnboardingStep.RoundEnd)
    expect(fsm.context.data.game).toEqual(board)
    expect(fsm.context.data.game.players.id0.ligrettoDeck.cards).toEqual([])
  })

  it('starts a new onboarding from scratch after another one has finished', async () => {
    const finished = new OnboardingStateMachine()
    await walkTo(finished, OnboardingStep.Result)
    expect(finished.context.data.opponentPileIndex).toBeDefined()

    const fresh = new OnboardingStateMachine()
    expect(fresh.current).toBe(OnboardingStep.Opponents)
    expect(fresh.context.data).toEqual({ isCycledInfoShown: false, bluePileIndex: 0, game: createOnboardingGame() })
    expect(await getAllowedEvents(fresh)).toEqual([OnboardingEvent.NextStep])
  })
})
