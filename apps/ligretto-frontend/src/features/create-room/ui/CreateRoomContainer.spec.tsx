// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoomAction } from '#ducks/rooms'
import { CreateRoomContainer } from './CreateRoomContainer'

const dispatch = vi.fn()

vi.mock('react-redux', async importActual => ({
  ...(await importActual<typeof import('react-redux')>()),
  useDispatch: () => dispatch,
  useSelector: () => null,
}))

beforeEach(() => dispatch.mockClear())
afterEach(cleanup)

it('dispatches room creation with only the entered name', () => {
  render(<CreateRoomContainer />)

  fireEvent.change(screen.getByPlaceholderText('Room name...'), { target: { value: 'Manual mode' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))

  expect(dispatch).toHaveBeenCalledOnce()
  expect(dispatch).toHaveBeenCalledWith(createRoomAction({ name: 'Manual mode' }))
})
