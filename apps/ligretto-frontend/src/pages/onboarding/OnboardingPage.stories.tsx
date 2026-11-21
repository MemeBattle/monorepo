import type { Meta, StoryObj } from '@storybook/react'
import { Provider } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'

import { history } from '#app/store'
import { createMockStore } from '#testing/lib/createMockStore'
import { OnboardingStep } from '#features/onboarding'

import { OnboardingPage } from './OnboardingPage'
import { ONBOARDING_SNAPSHOTS } from './snapshots'

const meta: Meta<typeof OnboardingPage> = {
  title: 'Ligretto / pages / OnboardingPage',
  component: OnboardingPage,
}
export default meta

type Story = StoryObj<typeof OnboardingPage>

const storyForStep = (step: OnboardingStep): Story => ({
  decorators: [
    Story => (
      <Provider store={createMockStore({ preloadedState: { onboarding: ONBOARDING_SNAPSHOTS[step] } })}>
        <Router history={history}>
          <Story />
        </Router>
      </Provider>
    ),
  ],
})

export const Step01_Opponents: Story = storyForStep(OnboardingStep.Opponents)
export const Step02_Playground: Story = storyForStep(OnboardingStep.Playground)
export const Step03_Stack: Story = storyForStep(OnboardingStep.Stack)
export const Step04_Row: Story = storyForStep(OnboardingStep.Row)
export const Step05_Ligretto: Story = storyForStep(OnboardingStep.Ligretto)
export const Step06_FirstCard: Story = storyForStep(OnboardingStep.FirstCard)
export const Step07_LigrettoCard: Story = storyForStep(OnboardingStep.LigrettoCard)
export const Step08_StackCard: Story = storyForStep(OnboardingStep.StackCard)
export const Step09_StackUnavailableCard: Story = storyForStep(OnboardingStep.StackUnavailableCard)
export const Step10_StackAvailableCard: Story = storyForStep(OnboardingStep.StackAvailableCard)
export const Step11_RowAvailableCard: Story = storyForStep(OnboardingStep.RowAvailableCard)
export const Step12_LigrettoAvailableCard: Story = storyForStep(OnboardingStep.LigrettoAvailableCard)
export const Step13_GameStarted: Story = storyForStep(OnboardingStep.GameStarted)
export const Step13a_GameStartedCycledInfo: Story = storyForStep(OnboardingStep.GameStartedCycledInfo)
export const Step14_OpponentTurn: Story = storyForStep(OnboardingStep.OpponentTurn)
export const Step15_OpponentTurnSecondCard: Story = storyForStep(OnboardingStep.OpponentTurnSecondCard)
export const Step15a_OpponentTurnCycledInfo: Story = storyForStep(OnboardingStep.OpponentTurnCycledInfo)
export const Step16_AdditionalLigrettoCard: Story = storyForStep(OnboardingStep.AdditionalLigrettoCard)
export const Step17_AdditionalRowCard: Story = storyForStep(OnboardingStep.AdditionalRowCard)
export const Step18_FinalLigrettoCard: Story = storyForStep(OnboardingStep.FinalLigrettoCard)
export const Step19_RoundEnd: Story = storyForStep(OnboardingStep.RoundEnd)
export const Step20_Result: Story = storyForStep(OnboardingStep.Result)
