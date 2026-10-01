import type { UnknownAction } from '@reduxjs/toolkit'
import { canPlaceCardOnDeck, type Card } from '@memebattle/ligretto-shared'
import { getInteractionTargetKey, type CardDragTarget, type CardInteractionTarget } from '#features/cardInteraction'
import {
  OnboardingEvent,
  OnboardingStep,
  putFirstCardAction,
  putSecondCardAction,
  putStackCardAction,
  putThirdCardAction,
  type OnboardingGame,
} from '#features/onboarding'

export interface OnboardingPlacement {
  event: OnboardingEvent
  /** The card the step lets the player move. */
  source: CardDragTarget
  action: (payload: { playgroundDeckIndex: number }) => UnknownAction
}

const PUT_SECOND_CARD: OnboardingPlacement = { event: OnboardingEvent.PutSecondCard, source: { type: 'row', index: 1 }, action: putSecondCardAction }
const PUT_THIRD_CARD: OnboardingPlacement = { event: OnboardingEvent.PutThirdCard, source: { type: 'row', index: 2 }, action: putThirdCardAction }

/** The scripted move of every step that has one. */
const PLACEMENT_BY_STEP: Partial<Record<OnboardingStep, OnboardingPlacement>> = {
  [OnboardingStep.FirstCard]: { event: OnboardingEvent.PutFirstCard, source: { type: 'row', index: 0 }, action: putFirstCardAction },
  [OnboardingStep.StackAvailableCard]: { event: OnboardingEvent.PutStackCard, source: { type: 'open-stack' }, action: putStackCardAction },
  [OnboardingStep.RowAvailableCard]: PUT_SECOND_CARD,
  [OnboardingStep.GameStarted]: PUT_SECOND_CARD,
  [OnboardingStep.GameStartedCycledInfo]: PUT_SECOND_CARD,
  [OnboardingStep.OpponentTurnSecondCard]: PUT_THIRD_CARD,
  [OnboardingStep.OpponentTurnCycledInfo]: PUT_THIRD_CARD,
}

export const getOnboardingPlacement = (step: OnboardingStep, allowedEvents: OnboardingEvent[]): OnboardingPlacement | undefined => {
  const placement = PLACEMENT_BY_STEP[step]
  return placement && allowedEvents.includes(placement.event) ? placement : undefined
}

const cardAt = (game: OnboardingGame, source: CardDragTarget): Card | undefined =>
  source.type === 'row' ? (game.players.id0.cards[source.index] ?? undefined) : game.players.id0.stackOpenDeck.cards[0]

/** The card of the step goes wherever the rules allow. */
export const canPlaceOnboardingCard = (
  placement: OnboardingPlacement | undefined,
  game: OnboardingGame,
  source: CardInteractionTarget | undefined,
  playgroundDeckIndex: number,
) => {
  if (!placement || !source || source.type === 'playground' || getInteractionTargetKey(source) !== getInteractionTargetKey(placement.source)) {
    return false
  }
  const card = cardAt(game, source)
  // The scripted table grows its decks on demand, so a missing one is simply empty.
  return !!card && canPlaceCardOnDeck(card, game.playground.decks[playgroundDeckIndex] ?? null)
}

export const getOnboardingPlacementAction = (
  placement: OnboardingPlacement | undefined,
  game: OnboardingGame,
  source: CardDragTarget,
  playgroundDeckIndex: number,
): UnknownAction | undefined =>
  placement && canPlaceOnboardingCard(placement, game, source, playgroundDeckIndex) ? placement.action({ playgroundDeckIndex }) : undefined
