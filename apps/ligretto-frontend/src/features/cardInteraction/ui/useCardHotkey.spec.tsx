// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

import { Hotkey } from '#ducks/game'
import { CardInteractionProvider } from './CardInteractionProvider'
import { useCardInteraction } from './useCardInteraction'
import { useCardHotkey } from './useCardHotkey'

afterEach(cleanup)

const HotkeyOwner = ({ hotkey = Hotkey.q, onActivate }: { hotkey?: Hotkey; onActivate: () => void }) => {
  useCardHotkey(hotkey, onActivate)
  return null
}

const SelectedCardHotkeyOwner = ({ onActivate }: { onActivate: () => void }) => {
  const { activeTarget } = useCardInteraction()
  const { toggleActiveTarget } = useCardInteraction({ type: 'row', index: 0 }, [])
  useCardHotkey(Hotkey.q, onActivate)

  return (
    <>
      <button data-card-interaction-element onClick={toggleActiveTarget}>
        select
      </button>
      <output>{activeTarget?.type ?? 'none'}</output>
    </>
  )
}

describe('useCardHotkey', () => {
  it('activates its enabled owner and prevents the browser default', () => {
    const onActivate = vi.fn()
    render(
      <CardInteractionProvider enabled>
        <HotkeyOwner onActivate={onActivate} />
      </CardInteractionProvider>,
    )
    const event = new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true, cancelable: true })

    document.body.dispatchEvent(event)

    expect(onActivate).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not activate an owner without a key', () => {
    const onActivate = vi.fn()
    render(
      <CardInteractionProvider enabled>
        <HotkeyOwner hotkey={undefined} onActivate={onActivate} />
      </CardInteractionProvider>,
    )

    fireEvent.keyDown(document, { key: 'q' })

    expect(onActivate).not.toHaveBeenCalled()
  })

  it('clears the active card before activating its hotkey owner', () => {
    const onActivate = vi.fn()
    const view = render(
      <CardInteractionProvider enabled>
        <SelectedCardHotkeyOwner onActivate={onActivate} />
      </CardInteractionProvider>,
    )
    fireEvent.click(view.getByText('select'))
    expect(view.getByText('row')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'q', code: 'KeyQ' })

    expect(onActivate).toHaveBeenCalledOnce()
    expect(view.getByText('none')).toBeTruthy()
  })
})
