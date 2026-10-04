// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { OnboardingEvent, OnboardingStateMachine, OnboardingStep } from '#features/onboarding/model/fsm'
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

describe('onboarding placement', () => {
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

  it('ignores a card the step does not move and a step without a move', async () => {
    const { game, placement } = await reach(OnboardingStep.FirstCard)
    expect(getOnboardingPlacementAction(placement, game, { type: 'row', index: 1 }, 0)).toBeUndefined()
    expect(getOnboardingPlacement(OnboardingStep.FirstCard, [OnboardingEvent.NextStep])).toBeUndefined()
    expect(getOnboardingPlacement(OnboardingStep.Playground, [OnboardingEvent.NextStep])).toBeUndefined()
  })
})
