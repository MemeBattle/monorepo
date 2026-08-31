// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardColors } from '@memebattle/ligretto-shared'
import { Card } from './Card'

afterEach(cleanup)

describe('Card activation', () => {
  it('waits for click instead of activating on mouse down', () => {
    const onClick = vi.fn()
    render(<Card color={CardColors.red} value={2} onClick={onClick} />)
    const card = screen.getByRole('button')

    fireEvent.mouseDown(card)
    expect(onClick).not.toHaveBeenCalled()

    fireEvent.click(card)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
