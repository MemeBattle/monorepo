// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

import { Hotkey } from '#ducks/game'
import { useCardHotkey } from './useCardHotkey'

afterEach(cleanup)

const HotkeyOwner = ({ hotkey = Hotkey.q, onActivate }: { hotkey?: Hotkey; onActivate: () => void }) => {
  useCardHotkey(hotkey, onActivate)
  return null
}

describe('useCardHotkey', () => {
  it('activates its enabled owner and prevents the browser default', () => {
    const onActivate = vi.fn()
    render(<HotkeyOwner onActivate={onActivate} />)
    const event = new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true, cancelable: true })

    document.body.dispatchEvent(event)

    expect(onActivate).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not activate an owner without a key', () => {
    const onActivate = vi.fn()
    render(<HotkeyOwner hotkey={undefined} onActivate={onActivate} />)

    fireEvent.keyDown(document, { key: 'q' })

    expect(onActivate).not.toHaveBeenCalled()
  })
})
