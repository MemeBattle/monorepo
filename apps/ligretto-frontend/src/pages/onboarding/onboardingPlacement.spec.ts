// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { canPlaceCardOnDeck, type Card } from '@memebattle/ligretto-shared'
import type { CardDragTarget } from '#features/cardInteraction'
import type { OnboardingGame } from '#features/onboarding'
import { OnboardingEvent, OnboardingStateMachine, OnboardingStep, getAllowedEvents } from '#features/onboarding/model/fsm'
import { ONBOARDING_SCRIPT } from '#features/onboarding/model/script'
import { canPlaceOnboardingCard, getOnboardingPlacement, getOnboardingPlacementAction } from './onboardingPlacement'

const DECKS = Array.from({ length: 12 }, (_, index) => index)

/** Replays the canonical script up to `step`, opening the blue pile on `bluePileIndex`. */
const reach = async (step: OnboardingStep, bluePileIndex = 0) => {
  const fsm = new OnboardingStateMachine()
  for (const entry of ONBOARDING_SCRIPT) {
    if (fsm.current === step) {
      break
    }
    await fsm.transition(entry.event, ...(entry.event === OnboardingEvent.PutFirstCard ? [bluePileIndex] : []))
  }
  expect(fsm.current).toBe(step)
  return {
    game: fsm.context.data.game,
    opponentPileIndex: fsm.context.data.opponentPileIndex,
    placement: getOnboardingPlacement(step, Object.values(OnboardingEvent)),
  }
}

const CYCLED_INFO_STEPS: ReadonlyArray<OnboardingStep> = [OnboardingStep.GameStartedCycledInfo, OnboardingStep.OpponentTurnCycledInfo]

interface ReachedState {
  step: OnboardingStep
  game: OnboardingGame
  allowedEvents: OnboardingEvent[]
  isCycledInfoShown: boolean
  /** How many times the history that reached this state entered a cycled-stack hint step. */
  cycledInfoEntries: number
}

/** Plays `history` on a fresh state machine, so every hook runs as in live play (hydrate() skips the pending onLeave). */
const replay = async (history: ReadonlyArray<OnboardingEvent>) => {
  const fsm = new OnboardingStateMachine()
  let cycledInfoEntries = 0
  let enteredBy = 'initial'
  for (const event of history) {
    const from = fsm.current
    await fsm.transition(event)
    enteredBy = `${from}:${event}`
    if (CYCLED_INFO_STEPS.includes(fsm.current)) {
      cycledInfoEntries += 1
    }
  }
  return { fsm, cycledInfoEntries, enteredBy }
}

/**
 * Every state the player can reach: the scripted moves, the optional ligretto moves and any number of stack flips,
 * with the default decks for the placements. Breadth-first over replayed event histories. A state is identified by its
 * step, its data and the transition that entered it (whose onLeave is still pending), which keeps the search finite.
 */
const reachableStates = async () => {
  const states = new Map<string, ReachedState>()
  const queue: Array<ReadonlyArray<OnboardingEvent>> = [[]]
  while (queue.length > 0) {
    const history = queue.shift()!
    const { fsm, cycledInfoEntries, enteredBy } = await replay(history)
    const key = JSON.stringify({ step: fsm.current, data: fsm.context.data, enteredBy })
    if (states.has(key)) {
      continue
    }
    const allowedEvents = await getAllowedEvents(fsm)
    const { game, isCycledInfoShown } = fsm.context.data
    states.set(key, { step: fsm.current, game, allowedEvents, isCycledInfoShown, cycledInfoEntries })
    queue.push(...allowedEvents.map(event => [...history, event]))
  }
  return [...states.values()]
}

/** The steps that introduce the zones with a Next button; the first move is taught right after them. */
const INTRO_STEPS: ReadonlyArray<OnboardingStep> = [
  OnboardingStep.Opponents,
  OnboardingStep.Playground,
  OnboardingStep.Cards,
  OnboardingStep.Stack,
  OnboardingStep.Row,
  OnboardingStep.Ligretto,
]

describe('onboarding placement', () => {
  it('never shows the player a card that fits a pile unless the step lets them put it there', async () => {
    const states = await reachableStates()
    // The traversal follows real play: it gets past the cycled-stack hint, and never shows that hint twice.
    expect(states.some(({ step, isCycledInfoShown }) => isCycledInfoShown && !CYCLED_INFO_STEPS.includes(step))).toBe(true)
    expect(Math.max(...states.map(({ cycledInfoEntries }) => cycledInfoEntries))).toBe(1)
    const misleading = new Set<string>()
    for (const { step, game, allowedEvents } of states.filter(({ step }) => !INTRO_STEPS.includes(step))) {
      const placement = getOnboardingPlacement(step, allowedEvents)
      const { cards, stackOpenDeck } = game.players.id0
      const visible: Array<[CardDragTarget, Card | null | undefined]> = [
        [{ type: 'open-stack' }, stackOpenDeck.cards[0]],
        ...cards.map((card, index): [CardDragTarget, Card | null] => [{ type: 'row', index }, card]),
      ]
      for (const [source, card] of visible) {
        for (const deck of DECKS) {
          if (card && canPlaceCardOnDeck(card, game.playground.decks[deck] ?? null) && !canPlaceOnboardingCard(placement, game, source, deck)) {
            misleading.add(`${step}: ${card.color} ${card.value} from ${source.type} fits deck ${deck}`)
          }
        }
      }
    }

    expect(states.some(({ step }) => step === OnboardingStep.Result)).toBe(true)
    expect([...misleading]).toEqual([])
  })

  it('lets the first one open any free deck', async () => {
    const { game, placement } = await reach(OnboardingStep.FirstCard)
    const source = { type: 'row', index: 0 } as const

    expect(DECKS.filter(index => canPlaceOnboardingCard(placement, game, source, index))).toEqual(DECKS)
    expect(getOnboardingPlacementAction(placement, game, source, 5)).toEqual({
      type: 'features/onboarding/putFirstCard',
      payload: { playgroundDeckIndex: 5 },
    })
  })

  it('sends the blue two and three onto the pile the player opened', async () => {
    const stack = await reach(OnboardingStep.StackAvailableCard, 5)
    expect(DECKS.filter(index => canPlaceOnboardingCard(stack.placement, stack.game, { type: 'open-stack' }, index))).toEqual([5])

    const row = await reach(OnboardingStep.RowAvailableCard, 5)
    expect(DECKS.filter(index => canPlaceOnboardingCard(row.placement, row.game, { type: 'row', index: 1 }, index))).toEqual([5])
  })

  it('lets the red one open any free deck but not land on the blue pile', async () => {
    const { game, placement } = await reach(OnboardingStep.GameStarted, 2)

    expect(DECKS.filter(index => canPlaceOnboardingCard(placement, game, { type: 'row', index: 1 }, index))).toEqual(
      DECKS.filter(index => index !== 2),
    )
  })

  it('sends the green three only onto the pile the opponent opened', async () => {
    const { game, opponentPileIndex, placement } = await reach(OnboardingStep.OpponentTurnSecondCard, 2)

    // The blue pile took the third deck and the red one the second, so the first deck was the first free one.
    expect(opponentPileIndex).toBe(0)
    expect(DECKS.filter(index => canPlaceOnboardingCard(placement, game, { type: 'row', index: 2 }, index))).toEqual([0])
  })

  it('takes the green five from the second row slot only onto the green four of the opponent', async () => {
    const { game, opponentPileIndex, placement } = await reach(OnboardingStep.AdditionalRowCard, 2)

    expect(placement?.source).toEqual({ type: 'row', index: 1 })
    expect(opponentPileIndex).toBe(0)
    expect(DECKS.filter(index => canPlaceOnboardingCard(placement, game, { type: 'row', index: 1 }, index))).toEqual([0])
    // Neither the blue nor the red pile nor a free deck takes it.
    expect(getOnboardingPlacementAction(placement, game, { type: 'row', index: 1 }, 2)).toBeUndefined()
    expect(getOnboardingPlacementAction(placement, game, { type: 'row', index: 1 }, 1)).toBeUndefined()
    expect(getOnboardingPlacementAction(placement, game, { type: 'row', index: 1 }, 5)).toBeUndefined()
    expect(getOnboardingPlacementAction(placement, game, { type: 'row', index: 1 }, 0)).toEqual({
      type: 'features/onboarding/putSecondCard',
      payload: { playgroundDeckIndex: 0 },
    })
  })

  it('moves no card once the round is over', async () => {
    const { game, placement } = await reach(OnboardingStep.RoundEnd)

    expect(placement).toBeUndefined()
    expect(DECKS.filter(index => canPlaceOnboardingCard(placement, game, { type: 'row', index: 1 }, index))).toEqual([])
  })

  it('ignores a card the step does not move and a step without a move', async () => {
    const { game, placement } = await reach(OnboardingStep.FirstCard)
    expect(getOnboardingPlacementAction(placement, game, { type: 'row', index: 1 }, 0)).toBeUndefined()
    expect(getOnboardingPlacement(OnboardingStep.FirstCard, [OnboardingEvent.NextStep])).toBeUndefined()
    expect(getOnboardingPlacement(OnboardingStep.Playground, [OnboardingEvent.NextStep])).toBeUndefined()
  })
})
