import { OnboardingEvent, OnboardingStep } from './fsm'

export interface OnboardingScriptEntry {
  event: OnboardingEvent
  /** The step the FSM lands in after the event. */
  step: OnboardingStep
}

/**
 * The canonical walkthrough of the onboarding: every event of the happy path
 * together with the step it leads to. The FSM unit test, the Storybook
 * snapshots and the e2e test all replay this single script.
 */
export const ONBOARDING_SCRIPT: ReadonlyArray<OnboardingScriptEntry> = [
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
