// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Provider } from 'react-redux'
import { connectToRoomSuccessAction, kickedFromRoomAction } from '@memebattle/ligretto-shared'

import { createMockStore } from '#testing/lib/createMockStore'
import { initialState } from '#ducks/game'
import { KickedFromRoomNotice } from './KickedFromRoomNotice'

const NOTICE = 'You were removed from the room by the host'

const renderNotice = () => {
  const store = createMockStore()
  render(
    <Provider store={store}>
      <KickedFromRoomNotice />
    </Provider>,
  )
  return { store }
}

describe('KickedFromRoomNotice', () => {
  it('says nothing until the host removes the user', () => {
    renderNotice()

    expect(screen.queryByText(NOTICE)).toBeNull()
  })

  it('tells the user they were removed, until they dismiss it', () => {
    const { store } = renderNotice()

    act(() => {
      store.dispatch(kickedFromRoomAction({ roomUuid: 'game' }))
    })
    expect(screen.getByText(NOTICE)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(NOTICE)).toBeNull()
  })

  it('goes away once the user is in a room again', () => {
    const { store } = renderNotice()

    act(() => {
      store.dispatch(kickedFromRoomAction({ roomUuid: 'game' }))
      store.dispatch(connectToRoomSuccessAction({ game: { ...initialState.game, id: 'game' } }))
    })

    expect(screen.queryByText(NOTICE)).toBeNull()
  })
})
