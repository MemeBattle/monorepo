// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CardColors } from '@memebattle/ligretto-shared'
import { CardInteractionProvider, useDraggableCard } from './index'

const Source = () => {
  const { listeners, setNodeRef } = useDraggableCard({ type: 'row', index: 0 }, { color: CardColors.red, value: 2 })
  return (
    <button ref={setNodeRef} {...listeners}>
      source
    </button>
  )
}

afterEach(async () => {
  fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 60))
  })
  cleanup()
})

it('cancels pending touch activation when the provider unmounts', async () => {
  const view = render(
    <CardInteractionProvider enabled>
      <Source />
    </CardInteractionProvider>,
  )
  fireEvent.touchStart(view.getByText('source'), { touches: [{ identifier: 1, clientX: 10, clientY: 10 }] })
  view.unmount()
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
  })
  const activate = vi.fn()
  const outside = render(<button onClick={activate}>outside</button>)
  fireEvent.click(outside.getByText('outside'))
  expect(activate).toHaveBeenCalledOnce()
})
