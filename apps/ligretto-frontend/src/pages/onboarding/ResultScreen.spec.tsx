// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { OnboardingStep, restartOnboardingAction } from '#features/onboarding'
import { createMockStore } from '#testing/lib/createMockStore'

import { ResultScreen } from './ResultScreen'
import { ONBOARDING_SNAPSHOTS } from './snapshots'

describe('onboarding ResultScreen', () => {
  it('restarts the onboarding in place when the player chooses to go through it again', () => {
    const store = createMockStore({ preloadedState: { onboarding: ONBOARDING_SNAPSHOTS[OnboardingStep.Result] } })
    const dispatch = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ResultScreen />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Пройти обучение ещё раз' }))

    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([restartOnboardingAction()])
    expect(screen.getByRole('button', { name: 'Закончить обучение' })).toBeTruthy()
  })
})
