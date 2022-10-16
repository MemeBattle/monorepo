import { CardHotkeyBadge } from './CardHotkeyBadge'
import { CardColors } from '@memebattle/ligretto-shared'
import { CardsRow } from '../CardsRow'
import { Hotkey } from 'ducks/game'

import { Card } from '../Card'

export default {
  title: 'Ligretto / CardHotkeyBadge',
}

export const DefaultView = () => (
  <CardsRow>
    <CardHotkeyBadge hotkey={Hotkey.x}>
      <Card color={CardColors.blue} value={1} />
    </CardHotkeyBadge>
    <CardHotkeyBadge hotkey={Hotkey.space}>
      <Card color={CardColors.red} value={5} />
    </CardHotkeyBadge>
    <CardHotkeyBadge hotkey={Hotkey.q}>
      <Card color={CardColors.yellow} value={7} />
    </CardHotkeyBadge>
  </CardsRow>
)
