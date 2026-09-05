// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { CancellableMouseSensor } from './CancellableSensors'

it('forwards a pending abort only once despite the lingering native Escape listener', async () => {
  const source = document.createElement('button')
  document.body.append(source)
  const event = new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
  source.dispatchEvent(event)
  let cancel: (() => void) | undefined
  const onAbort = vi.fn()
  const onCancel = vi.fn()
  const onStart = vi.fn()
  new CancellableMouseSensor({
    active: 'row.0.red.2',
    activeNode: { id: 'row.0.red.2', key: 'source', node: { current: source }, activatorNode: { current: source }, data: { current: {} } },
    context: { current: {} } as ConstructorParameters<typeof CancellableMouseSensor>[0]['context'],
    event,
    options: {
      activationConstraint: { distance: 6 },
      registerCancellation: callback => {
        cancel = callback
        return () => {}
      },
    },
    onAbort,
    onCancel,
    onStart,
    onPending: vi.fn(),
    onMove: vi.fn(),
    onEnd: vi.fn(),
  })
  cancel!()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
  await new Promise(resolve => setTimeout(resolve, 60))
  source.remove()
  expect(onAbort).toHaveBeenCalledOnce()
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onStart).not.toHaveBeenCalled()
})
