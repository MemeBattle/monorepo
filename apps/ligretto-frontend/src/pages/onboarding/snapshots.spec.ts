// @vitest-environment jsdom

import { CardColors } from '@memebattle/ligretto-shared'
import { describe, expect, it } from 'vitest'

import { OnboardingEvent, OnboardingStep, onboardingOpponentPileIndexSelector } from '#features/onboarding'
import { createMockStore } from '#testing/lib/createMockStore'
import { ONBOARDING_SNAPSHOTS } from './snapshots'

describe('onboarding Storybook snapshots', () => {
  it('has no opponent pile before the opponent opens it', () => {
    expect(ONBOARDING_SNAPSHOTS[OnboardingStep.GameStarted].opponentPileIndex).toBeUndefined()
  })

  it.each([
    [OnboardingStep.OpponentTurn, 1],
    [OnboardingStep.OpponentTurnSecondCard, 2],
    [OnboardingStep.OpponentTurnCycledInfo, 2],
    [OnboardingStep.AdditionalLigrettoCard, 4],
    [OnboardingStep.AdditionalRowCard, 4],
    [OnboardingStep.FinalLigrettoCard, 5],
    [OnboardingStep.RoundEnd, 5],
  ] as const)('anchors the opponent hint to the green pile in %s', (step, topValue) => {
    const snapshot = ONBOARDING_SNAPSHOTS[step]
    // Use the same store setup as the stories, without the live onboarding listener.
    const store = createMockStore({ preloadedState: { onboarding: snapshot } })
    const index = onboardingOpponentPileIndexSelector(store.getState())

    expect(index).toBe(2) // The canonical script opens blue on 0 and red on 1.
    const cards = snapshot.game.playground.decks[index!]?.cards
    expect(cards?.[cards.length - 1]).toEqual({ color: CardColors.green, value: topValue })
  })

  it('shows the finished board with an empty ligretto deck on the round end step, before the results', () => {
    const roundEnd = ONBOARDING_SNAPSHOTS[OnboardingStep.RoundEnd]

    expect(roundEnd.game.players.id0.ligrettoDeck.cards).toEqual([])
    expect(roundEnd.allowedEvents).toEqual([OnboardingEvent.NextStep])
    expect(roundEnd.game).toEqual(ONBOARDING_SNAPSHOTS[OnboardingStep.Result].game)
  })
})
