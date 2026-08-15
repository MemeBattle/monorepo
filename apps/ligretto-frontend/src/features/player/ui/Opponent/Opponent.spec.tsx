// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { CardColors, PlayerStatus } from '@memebattle/ligretto-shared'
import { describe, expect, it } from 'vitest'

import { Opponent } from './Opponent'

const opponentProps = {
  id: 'opponent-id',
  username: 'Opponent',
  stackOpenDeckCards: [{ color: CardColors.blue, value: 3 }],
  cards: [{ color: CardColors.red, value: 5 }, null],
}

describe('Opponent connection state', () => {
  it('dims the opponent and cards while keeping the disconnected icon red', () => {
    const view = render(<Opponent {...opponentProps} status={PlayerStatus.Disconnected} />)

    const disconnectedOpponent = screen.getByRole('group', { name: 'Opponent player' })
    expect(disconnectedOpponent.dataset.connectionState).toBe('disconnected')

    const avatar = screen.getByRole('img', { name: 'Opponent' })
    const filteredAvatar = avatar.parentElement?.parentElement
    expect(getComputedStyle(filteredAvatar!).filter).toContain('grayscale')
    expect(Number(getComputedStyle(filteredAvatar!).opacity)).toBeLessThan(1)

    const cards = screen.getByTestId('opponent-cards')
    expect(getComputedStyle(cards).filter).toContain('grayscale')
    expect(Number(getComputedStyle(cards).opacity)).toBeLessThan(1)

    const connectionIcon = screen.getByRole('img', { name: 'Connection lost' })
    const username = screen.getByText('Opponent')
    const statusRow = username.parentElement
    expect(connectionIcon.parentElement?.parentElement).toBe(statusRow)
    expect(getComputedStyle(statusRow!).minWidth).toBe('0px')
    expect(getComputedStyle(username).fontSize).toBe('0.75rem')
    expect(getComputedStyle(connectionIcon).fontSize).toBe('1rem')
    expect(getComputedStyle(connectionIcon).filter).not.toContain('grayscale')
    expect(getComputedStyle(connectionIcon).color).toBe('rgb(211, 47, 47)')

    expect(getComputedStyle(filteredAvatar!).height).toBe('100%')
    expect(getComputedStyle(filteredAvatar!).aspectRatio).toBe('1 / 1')
    expect(getComputedStyle(filteredAvatar!).flexShrink).toBe('0')

    view.rerender(<Opponent {...opponentProps} status={PlayerStatus.InGame} />)

    const connectedOpponent = screen.getByRole('group', { name: 'Opponent player' })
    const connectedAvatar = screen.getByRole('img', { name: 'Opponent' })
    const connectedFrame = connectedAvatar.parentElement?.parentElement
    expect(connectedFrame?.parentElement?.parentElement).toBe(connectedOpponent)
    expect(getComputedStyle(connectedFrame!).aspectRatio).toBe('1 / 1')
    expect(getComputedStyle(connectedFrame!).filter).not.toContain('grayscale')
    expect(connectedOpponent.dataset.connectionState).toBe('online')
    expect(getComputedStyle(screen.getByTestId('opponent-cards')).filter).not.toContain('grayscale')
    expect(screen.queryByRole('img', { name: 'Connection lost' })).toBeNull()
  })
})
