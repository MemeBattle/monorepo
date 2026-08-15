// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { CardColors, PlayerStatus } from '@memebattle/ligretto-shared'
import { describe, expect, it } from 'vitest'

import { Opponent } from './Opponent'

const opponentProps = {
  id: 'opponent-id',
  username: 'Opponent',
  status: PlayerStatus.InGame,
  stackOpenDeckCards: [{ color: CardColors.blue, value: 3 }],
  cards: [{ color: CardColors.red, value: 5 }, null],
}

describe('Opponent connection state', () => {
  it('dims the whole opponent and shows a connection indicator only while disconnected', () => {
    const view = render(<Opponent {...opponentProps} isDisconnected />)

    const disconnectedOpponent = screen.getByRole('group', { name: 'Opponent player' })
    expect(disconnectedOpponent.dataset.connectionState).toBe('disconnected')
    expect(getComputedStyle(disconnectedOpponent).filter).toContain('grayscale')
    expect(Number(getComputedStyle(disconnectedOpponent).opacity)).toBeLessThan(1)
    const connectionIcon = screen.getByRole('img', { name: 'Connection lost' })
    expect(connectionIcon).toBeTruthy()
    expect(getComputedStyle(connectionIcon).fontSize).toBe('0.75rem')

    const avatar = screen.getByRole('img', { name: 'Opponent' })
    const avatarWrapper = avatar.parentElement?.parentElement
    expect(getComputedStyle(avatarWrapper!).height).toBe('100%')
    expect(getComputedStyle(avatarWrapper!).aspectRatio).toBe('1 / 1')
    expect(getComputedStyle(avatarWrapper!).flexShrink).toBe('1')

    view.rerender(<Opponent {...opponentProps} />)

    const connectedOpponent = screen.getByRole('group', { name: 'Opponent player' })
    expect(connectedOpponent.dataset.connectionState).toBe('online')
    expect(getComputedStyle(connectedOpponent).filter).not.toContain('grayscale')
    expect(screen.queryByRole('img', { name: 'Connection lost' })).toBeNull()
  })
})
