import type { Meta, StoryObj } from '@storybook/react'
import { expect } from 'storybook/test'
import { CardHotkeyBadge } from './CardHotkeyBadge'
import { CardColors } from '@memebattle/ligretto-shared'
import { CardsRow } from '../CardsRow'
import { Hotkey } from '#ducks/game'
import { CardPlace } from '../CardPlace'
import { Card } from '../Card'

const meta: Meta<typeof CardHotkeyBadge> = {
  title: 'Ligretto / CardHotkeyBadge',
  component: CardHotkeyBadge,
}
export default meta

type Story = StoryObj<typeof CardHotkeyBadge>

export const DefaultView: Story = {
  play: async ({ canvas }) => {
    const isMobile = window.innerWidth < 600

    for (const hotkey of ['X', 'SPACE', 'Q']) {
      const badge = canvas.getByText(hotkey)
      const wrapper = badge.parentElement!
      const card = wrapper.querySelector('button')!

      await expect(card).toBeVisible()
      if (isMobile) {
        await expect(badge).not.toBeVisible()
        await expect(badge.getBoundingClientRect().width).toBe(0)
        await expect(badge.getBoundingClientRect().height).toBe(0)
      } else {
        await expect(badge).toBeVisible()
      }
      await expect(wrapper.getBoundingClientRect().width).toBe(card.getBoundingClientRect().width)
      await expect(wrapper.getBoundingClientRect().height).toBe(card.getBoundingClientRect().height)
    }
  },
  render: () => (
    <CardsRow>
      <CardPlace>
        <CardHotkeyBadge hotkey={Hotkey.x}>
          <Card color={CardColors.blue} value={1} />
        </CardHotkeyBadge>
      </CardPlace>
      <CardPlace>
        <CardHotkeyBadge hotkey={Hotkey.space}>
          <Card color={CardColors.red} value={5} />
        </CardHotkeyBadge>
      </CardPlace>
      <CardPlace>
        <CardHotkeyBadge hotkey={Hotkey.q}>
          <Card color={CardColors.yellow} value={7} />
        </CardHotkeyBadge>
      </CardPlace>
    </CardsRow>
  ),
}
