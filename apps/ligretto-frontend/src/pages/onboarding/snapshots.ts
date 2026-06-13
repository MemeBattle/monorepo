import cloneDeep from 'lodash/cloneDeep'

import { OnboardingStep } from '#features/onboarding'
import { OnboardingEvent, OnboardingStateMachine } from '#features/onboarding/model/fsm'
import type { OnboardingState } from '#features/onboarding/model/slice'

const SCRIPT: ReadonlyArray<OnboardingEvent> = [
  OnboardingEvent.NextStep, // Opponents → Playground
  OnboardingEvent.NextStep, // Playground → Cards
  OnboardingEvent.NextStep, // Cards → Stack
  OnboardingEvent.NextStep, // Stack → Row
  OnboardingEvent.NextStep, // Row → Ligretto
  OnboardingEvent.NextStep, // Ligretto → FirstCard
  OnboardingEvent.PutFirstCard, // FirstCard → LigrettoCard
  OnboardingEvent.PutLigretto, // LigrettoCard → StackCard
  OnboardingEvent.NextStackCard, // StackCard → StackUnavailableCard
  OnboardingEvent.NextStackCard, // StackUnavailableCard → StackAvailableCard
  OnboardingEvent.PutStackCard, // StackAvailableCard → RowAvailableCard
  OnboardingEvent.PutSecondCard, // RowAvailableCard → LigrettoAvailableCard
  OnboardingEvent.PutLigretto, // LigrettoAvailableCard → GameStarted
  OnboardingEvent.PutSecondCard, // GameStarted → OpponentTurn
  OnboardingEvent.PutLigretto, // OpponentTurn → Result
]

const toOnboardingState = (fsm: OnboardingStateMachine): OnboardingState => {
  const { current, data } = fsm.dehydrate()
  return { step: current, game: cloneDeep(data.game), results: cloneDeep(data.results) }
}

const snapshots: Partial<Record<OnboardingStep, OnboardingState>> = {}

const fsm = new OnboardingStateMachine()
snapshots[fsm.current] = toOnboardingState(fsm)
for (const event of SCRIPT) {
  await fsm.tryTransition(event)
  snapshots[fsm.current] = toOnboardingState(fsm)
}

// Cycled-info states are technical fallbacks (stack-empty branch) not visited by the
// canonical script. Snapshot them by reusing the corresponding non-cycled state.
snapshots[OnboardingStep.GameStartedCycledInfo] = {
  ...(snapshots[OnboardingStep.GameStarted] as OnboardingState),
  step: OnboardingStep.GameStartedCycledInfo,
}
snapshots[OnboardingStep.OpponentTurnCycledInfo] = {
  ...(snapshots[OnboardingStep.OpponentTurn] as OnboardingState),
  step: OnboardingStep.OpponentTurnCycledInfo,
}

export const ONBOARDING_SNAPSHOTS = snapshots as Record<OnboardingStep, OnboardingState>
