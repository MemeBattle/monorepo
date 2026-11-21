// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GameGrid } from './GameGrid'

const seatsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => getComputedStyle(screen.getByText(`opponent-${index}`).parentElement!).gridArea)

const renderGrid = (count: number, bottomElement: string | null) =>
  render(
    <GameGrid centerElement="playground" bottomElement={bottomElement}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>{`opponent-${index}`}</div>
      ))}
    </GameGrid>,
  )

describe('GameGrid desktop seats', () => {
  it('seats each of four opponents once around a spectator', () => {
    renderGrid(4, null)

    expect(seatsOf(4)).toEqual(['top', 'middleLeft', 'middleRight', 'bottom'])
  })

  it.each([
    [1, ['top']],
    [2, ['middleLeft', 'middleRight']],
    [3, ['top', 'middleLeft', 'middleRight']],
  ])('keeps the seats of %i opponents for a player and a spectator', (count, seats) => {
    const { unmount } = renderGrid(count, 'hand')
    expect(seatsOf(count)).toEqual(seats)
    expect(getComputedStyle(screen.getByText('hand')).gridArea).toBe('bottom')
    unmount()

    renderGrid(count, null)
    expect(seatsOf(count)).toEqual(seats)
  })
})
