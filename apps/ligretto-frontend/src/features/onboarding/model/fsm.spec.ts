import { describe, expect, it } from 'vitest'
import { CardColors } from '@memebattle/ligretto-shared'

import { OnboardingEvent, OnboardingStateMachine, OnboardingStep, ONBOARDING_HARDCODED_RESULTS } from './fsm'

const HAPPY_PATH: ReadonlyArray<{ event: OnboardingEvent; step: OnboardingStep }> = [
  { event: OnboardingEvent.NextStep, step: OnboardingStep.Playground },
  { event: OnboardingEvent.NextStep, step: OnboardingStep.Cards },
  { event: OnboardingEvent.NextStep, step: OnboardingStep.Stack },
  { event: OnboardingEvent.NextStep, step: OnboardingStep.Row },
  { event: OnboardingEvent.NextStep, step: OnboardingStep.Ligretto },
  { event: OnboardingEvent.NextStep, step: OnboardingStep.FirstCard },
  { event: OnboardingEvent.PutFirstCard, step: OnboardingStep.LigrettoCard },
  { event: OnboardingEvent.PutLigretto, step: OnboardingStep.StackCard },
  { event: OnboardingEvent.NextStackCard, step: OnboardingStep.StackUnavailableCard },
  { event: OnboardingEvent.NextStackCard, step: OnboardingStep.StackAvailableCard },
  { event: OnboardingEvent.PutStackCard, step: OnboardingStep.RowAvailableCard },
  { event: OnboardingEvent.PutSecondCard, step: OnboardingStep.LigrettoAvailableCard },
  { event: OnboardingEvent.PutLigretto, step: OnboardingStep.GameStarted },
  { event: OnboardingEvent.PutSecondCard, step: OnboardingStep.OpponentTurn },
  { event: OnboardingEvent.NextStackCard, step: OnboardingStep.OpponentTurnSecondCard },
  { event: OnboardingEvent.PutThirdCard, step: OnboardingStep.FinalLigrettoCard },
  // Two ligretto cards are left when the optional moves were skipped — the round ends on the last one
  { event: OnboardingEvent.PutLigretto, step: OnboardingStep.FinalLigrettoCard },
  { event: OnboardingEvent.PutLigretto, step: OnboardingStep.Result },
]

const walkTo = async (fsm: OnboardingStateMachine, step: OnboardingStep) => {
  for (const { event, step: nextStep } of HAPPY_PATH) {
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

    for (const { event, step } of HAPPY_PATH) {
      await fsm.transition(event)
      expect(fsm.current).toBe(step)
    }

    expect(fsm.context.data.results).toEqual(ONBOARDING_HARDCODED_RESULTS)
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

  it('cycles the stack open deck instead of leaving it empty', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.GameStarted)

    const openDeck = () => fsm.context.data.game.players.id0.stackOpenDeck.cards

    // After the scripted steps a single card is left in the open deck.
    expect(openDeck()).toHaveLength(1)

    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStarted)
    expect(openDeck()).toHaveLength(0)
  })

  it('shows the cycled-info hint once when the open deck is exhausted', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.GameStarted)

    const openDeck = () => fsm.context.data.game.players.id0.stackOpenDeck.cards

    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(openDeck()).toHaveLength(0)

    // Deck is empty for the first time — the hint step is entered.
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStartedCycledInfo)

    // Leaving the hint re-flips the deck.
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStarted)
    expect(openDeck()).toHaveLength(3)

    // Exhaust the deck again: the hint is not shown a second time, the deck just cycles.
    await fsm.transition(OnboardingEvent.NextStackCard)
    await fsm.transition(OnboardingEvent.NextStackCard)
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(openDeck()).toHaveLength(0)
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.GameStarted)
    expect(openDeck()).toHaveLength(3)
  })

  it('plays the green sequence with the opponent and ends the round with a ligretto card into the row', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.OpponentTurn)

    const { game } = fsm.context.data
    // The opponent has opened the green deck with the green one.
    expect(game.playground.decks[2]?.cards).toEqual([{ value: 1, color: CardColors.green }])

    // Flipping the stack makes the opponent answer with the green two.
    await fsm.transition(OnboardingEvent.NextStackCard)
    expect(fsm.current).toBe(OnboardingStep.OpponentTurnSecondCard)
    expect(game.playground.decks[2]?.cards).toEqual([
      { value: 1, color: CardColors.green },
      { value: 2, color: CardColors.green },
    ])

    // The player puts the green three from the row, freeing a row slot.
    await fsm.transition(OnboardingEvent.PutThirdCard)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    expect(game.playground.decks[2]?.cards).toEqual([
      { value: 1, color: CardColors.green },
      { value: 2, color: CardColors.green },
      { value: 3, color: CardColors.green },
    ])
    expect(game.players.id0.cards[2]).toBeNull()

    // The first ligretto card fills the free slot, but the deck is not empty yet — the round goes on.
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    expect(game.players.id0.cards[1]).toEqual({ value: 5, color: CardColors.yellow })
    expect(game.players.id0.ligrettoDeck.cards).toHaveLength(1)

    // The last ligretto card empties the deck and ends the round.
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.Result)
    expect(game.players.id0.cards[2]).toEqual({ value: 6, color: CardColors.yellow })
    expect(game.players.id0.ligrettoDeck.cards).toHaveLength(0)
  })

  it('allows putting a ligretto card into the free row slot on the opponent turn', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.OpponentTurn)

    const player = () => fsm.context.data.game.players.id0
    // The second row slot was freed when the player put the second card on the playground.
    expect(player().cards[1]).toBeNull()
    expect(player().ligrettoDeck.cards).toHaveLength(2)

    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.OpponentTurn)
    expect(player().cards[1]).toEqual({ value: 5, color: CardColors.yellow })
    expect(player().ligrettoDeck.cards).toHaveLength(1)

    // The slot is occupied now — the move is not available anymore.
    expect(await fsm.tryTransition(OnboardingEvent.PutLigretto)).toBe(false)
    expect(player().ligrettoDeck.cards).toHaveLength(1)

    // After the optional move the final ligretto card empties the deck.
    await fsm.transition(OnboardingEvent.NextStackCard)
    await fsm.transition(OnboardingEvent.PutThirdCard)
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.Result)
    expect(player().ligrettoDeck.cards).toHaveLength(0)
  })

  it('allows putting a ligretto card into the free row slot after the opponent plays the green two', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.OpponentTurnSecondCard)

    const player = () => fsm.context.data.game.players.id0
    expect(player().cards[1]).toBeNull()

    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.OpponentTurnSecondCard)
    expect(player().cards[1]).toEqual({ value: 5, color: CardColors.yellow })
    expect(player().ligrettoDeck.cards).toHaveLength(1)

    // The slot is occupied now — the move is not available anymore.
    expect(await fsm.tryTransition(OnboardingEvent.PutLigretto)).toBe(false)
  })

  it('fills results only when the ligretto deck is emptied', async () => {
    const fsm = new OnboardingStateMachine()
    await walkTo(fsm, OnboardingStep.FinalLigrettoCard)
    expect(fsm.context.data.results).toBeUndefined()

    // One of the two remaining ligretto cards is put — the round is not over yet.
    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.FinalLigrettoCard)
    expect(fsm.context.data.results).toBeUndefined()

    await fsm.transition(OnboardingEvent.PutLigretto)
    expect(fsm.current).toBe(OnboardingStep.Result)
    expect(fsm.context.data.results).toEqual(ONBOARDING_HARDCODED_RESULTS)
  })
})
