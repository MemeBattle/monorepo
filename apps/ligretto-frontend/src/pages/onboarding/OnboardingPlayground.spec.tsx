// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OnboardingPlayground } from './OnboardingPlayground'

afterEach(cleanup)

describe('OnboardingPlayground', () => {
  it('routes an empty deck click to the onboarding handler', () => {
    const onDeckClick = vi.fn()
    const view = render(<OnboardingPlayground cardsDecks={[null]} onDeckClick={onDeckClick} />)

    fireEvent.click(view.container.querySelector('[data-card-drop-target="playground.0"]')!)

    expect(onDeckClick).toHaveBeenCalledWith(0)
  })
})
