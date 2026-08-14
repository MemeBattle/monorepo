// @vitest-environment jsdom

import { createRef } from 'react'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createOnboardingGame } from '#features/onboarding/model/fsm'
import { OnboardingEvent, putFirstCardAction, putSecondCardAction } from '#features/onboarding'
import { CardFocusProvider } from '#features/cardFocus'
import { PlayerRowCards } from './PlayerRowCards'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  game: undefined as ReturnType<typeof createOnboardingGame> | undefined,
  allowedEvents: [] as OnboardingEvent[],
}))

vi.mock('react-redux', async importActual => ({
  ...(await importActual<typeof import('react-redux')>()),
  useDispatch: () => mocks.dispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}))

vi.mock('#features/onboarding', async importActual => ({
  ...(await importActual<typeof import('#features/onboarding')>()),
  onboardingGameSelector: () => mocks.game,
  onboardingAllowedEventsSelector: () => mocks.allowedEvents,
}))

const cardRefs = [createRef<HTMLDivElement>(), createRef<HTMLDivElement>(), createRef<HTMLDivElement>()] as const
const activate = (element: HTMLElement) => {
  fireEvent.mouseDown(element)
  fireEvent.click(element)
}

beforeEach(() => {
  mocks.dispatch.mockClear()
  mocks.game = createOnboardingGame()
  mocks.allowedEvents = []
})
afterEach(cleanup)

it('selects a normal row card without completing its placement', () => {
  mocks.allowedEvents = [OnboardingEvent.PutSecondCard]
  render(
    <CardFocusProvider enabled>
      <PlayerRowCards cardRefs={[...cardRefs]} />
    </CardFocusProvider>,
  )

  const card = within(document.querySelector('[data-test-id="OnboardingPage-RowCard-1"]')!).getByRole('button')
  activate(card)

  expect(mocks.dispatch).not.toHaveBeenCalledWith(putSecondCardAction())
  expect(card.getAttribute('data-card-focused')).toBe('true')
})

it('places a value-1 row card immediately without focusing it', () => {
  mocks.allowedEvents = [OnboardingEvent.PutFirstCard]
  render(
    <CardFocusProvider enabled>
      <PlayerRowCards cardRefs={[...cardRefs]} />
    </CardFocusProvider>,
  )

  const card = within(document.querySelector('[data-test-id="OnboardingPage-RowCard-0"]')!).getByRole('button')
  activate(card)

  expect(mocks.dispatch).toHaveBeenCalledOnce()
  expect(mocks.dispatch).toHaveBeenCalledWith(putFirstCardAction())
  expect(card.getAttribute('data-card-focused')).toBe('false')
})
