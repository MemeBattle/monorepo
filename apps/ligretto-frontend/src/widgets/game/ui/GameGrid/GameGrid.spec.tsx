// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GameGrid } from './GameGrid'

const opponentsOf = (count: number) => Array.from({ length: count }, (_, index) => `opponent-${index}`)

const renderGrid = (opponents: string[], hand?: string) =>
  render(
    <GameGrid centerElement="playground" bottomElement={hand}>
      {opponents.map(opponent => (
        <div key={opponent}>{opponent}</div>
      ))}
    </GameGrid>,
  )

const shownOpponents = () => screen.queryAllByText(/^opponent-/).map(opponent => opponent.textContent)

describe('GameGrid on desktop', () => {
  it('shows a spectator each of four opponents once, in their order', () => {
    renderGrid(opponentsOf(4))

    expect(shownOpponents()).toEqual(opponentsOf(4))
  })

  it.each([1, 2, 3])('shows each of %i opponents once, in their order, to a player with their hand and to a spectator', count => {
    const { unmount } = renderGrid(opponentsOf(count), 'hand')
    expect(shownOpponents()).toEqual(opponentsOf(count))
    expect(screen.getAllByText('hand')).toHaveLength(1)
    unmount()

    renderGrid(opponentsOf(count))
    expect(shownOpponents()).toEqual(opponentsOf(count))
  })
})
