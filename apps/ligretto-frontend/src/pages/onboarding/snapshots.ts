import { ONBOARDING_SCRIPT, OnboardingStep } from '#features/onboarding'
import { OnboardingEvent, OnboardingStateMachine, getAllowedEvents } from '#features/onboarding/model/fsm'
import type { OnboardingState } from '#features/onboarding/model/slice'

const toOnboardingState = async (fsm: OnboardingStateMachine): Promise<OnboardingState> => {
  const { current, data } = fsm.dehydrate()
  return { step: current, game: structuredClone(data.game), results: structuredClone(data.results), allowedEvents: await getAllowedEvents(fsm) }
}

const snapshots: Partial<Record<OnboardingStep, OnboardingState>> = {}

const fsm = new OnboardingStateMachine()
snapshots[fsm.current] = await toOnboardingState(fsm)
for (const { event } of ONBOARDING_SCRIPT) {
  await fsm.tryTransition(event)
  snapshots[fsm.current] = await toOnboardingState(fsm)
}

/**
 * The cycled-info hints are entered off the canonical script, by exhausting the
 * open deck. Walk a fresh FSM to the given step and flip the stack until the
 * hint state is reached.
 */
const snapshotCycledInfo = async (from: OnboardingStep, cycledInfoStep: OnboardingStep) => {
  const detourFsm = new OnboardingStateMachine()
  for (const { event, step } of ONBOARDING_SCRIPT) {
    await detourFsm.tryTransition(event)
    if (step === from) {
      break
    }
  }
  while (detourFsm.current !== cycledInfoStep) {
    await detourFsm.transition(OnboardingEvent.NextStackCard)
  }
  snapshots[cycledInfoStep] = await toOnboardingState(detourFsm)
}

await snapshotCycledInfo(OnboardingStep.GameStarted, OnboardingStep.GameStartedCycledInfo)
await snapshotCycledInfo(OnboardingStep.OpponentTurnSecondCard, OnboardingStep.OpponentTurnCycledInfo)

export const ONBOARDING_SNAPSHOTS = snapshots as Record<OnboardingStep, OnboardingState>
