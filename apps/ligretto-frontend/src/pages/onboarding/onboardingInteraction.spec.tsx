// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CardColors } from '@memebattle/ligretto-shared'
import { CardInteractionProvider, useCardInteraction } from '#features/cardInteraction'
import { OnboardingOpenStackCard } from './OnboardingOpenStackCard'
import { createRef } from 'react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { initialState, onboardingReducer, setOnboardingState } from '#features/onboarding/model/slice'
import { OnboardingEvent } from '#features/onboarding'
import { PlayerRowCards } from './PlayerRowCards'

afterEach(cleanup)

it('keeps onboarding row refs and clears a selection when the step disables that row', () => {
  const state = { ...initialState, allowedEvents: [OnboardingEvent.PutFirstCard] }
  const store = configureStore({ reducer: { onboarding: onboardingReducer }, preloadedState: { onboarding: state } })
  const refs = [createRef<HTMLDivElement>(), createRef<HTMLDivElement>(), createRef<HTMLDivElement>()] as const
  const rowRef = createRef<HTMLDivElement>()
  const view = render(
    <Provider store={store}>
      <CardInteractionProvider enabled>
        <PlayerRowCards ref={rowRef} cardRefs={[...refs]} />
        <Selection />
      </CardInteractionProvider>
    </Provider>,
  )
  expect(rowRef.current?.contains(refs[0].current)).toBe(true)
  const card = refs[0].current!.querySelector('button')!
  fireEvent.click(card)
  expect(view.getByText('row')).toBeTruthy()
  act(() => {
    store.dispatch(setOnboardingState({ ...state, allowedEvents: [OnboardingEvent.NextStep] }))
  })
  expect(view.getByText('none')).toBeTruthy()
  fireEvent.click(card)
  expect(view.getByText('none')).toBeTruthy()
})

const Selection = () => {
  const { activeTarget } = useCardInteraction()
  return <output>{activeTarget?.type ?? 'none'}</output>
}

it('clears onboarding selection when its allowed interaction expires', () => {
  const tree = (isActive: boolean) => (
    <CardInteractionProvider enabled>
      <OnboardingOpenStackCard card={{ color: CardColors.red, value: 2 }} isActive={isActive} />
      <Selection />
    </CardInteractionProvider>
  )
  const view = render(tree(true))
  fireEvent.click(view.getByRole('button'))
  expect(view.getByText('open-stack')).toBeTruthy()
  view.rerender(tree(false))
  expect(view.getByText('none')).toBeTruthy()
  fireEvent.click(view.getByRole('button'))
  expect(view.getByText('none')).toBeTruthy()
  view.rerender(tree(true))
  expect(view.getByText('none')).toBeTruthy()
  fireEvent.click(view.getByRole('button'))
  expect(view.getByText('open-stack')).toBeTruthy()
})
