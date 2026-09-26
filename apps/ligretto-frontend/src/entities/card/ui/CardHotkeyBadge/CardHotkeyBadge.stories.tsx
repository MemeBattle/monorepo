import type { Meta, StoryObj } from '@storybook/react'
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
