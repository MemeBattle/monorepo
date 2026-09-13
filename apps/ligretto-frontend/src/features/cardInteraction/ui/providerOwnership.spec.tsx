// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CardInteractionProvider, useCardHotkey } from '../index'
import { Hotkey } from '#ducks/game'

afterEach(cleanup)

const Owner = ({ activate }: { activate: () => void }) => {
  useCardHotkey(Hotkey.q, activate)
  return <span>owner</span>
}

it('provides interactions without a Redux store or game card renderer', () => {
  render(
    <CardInteractionProvider enabled>
      <Owner activate={() => {}} />
    </CardInteractionProvider>,
  )
  expect(screen.getByText('owner')).toBeTruthy()
})

it('does not invoke hotkey owners while the provider is disabled', () => {
  const activate = vi.fn()
  render(
    <CardInteractionProvider enabled={false}>
      <Owner activate={activate} />
    </CardInteractionProvider>,
  )
  fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
  expect(activate).not.toHaveBeenCalled()
})

it('makes disabled descendants natively inert and restores input after re-enabling', () => {
  const activate = vi.fn()
  const tree = (enabled: boolean) => (
    <CardInteractionProvider enabled={enabled}>
      <Owner activate={activate} />
    </CardInteractionProvider>
  )
  const view = render(tree(false))
  expect(screen.getByText('owner').closest('[inert]')).not.toBeNull()
  fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
  expect(activate).not.toHaveBeenCalled()
  view.rerender(tree(true))
  expect(screen.getByText('owner').closest('[inert]')).toBeNull()
  fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
  expect(activate).toHaveBeenCalledOnce()
})
