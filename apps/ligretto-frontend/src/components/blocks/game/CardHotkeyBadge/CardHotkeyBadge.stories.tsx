import { CardHotkeyBadge } from './CardHotkeyBadge'
import { CardColors } from '@memebattle/ligretto-shared'
import { CardsRow } from '../CardsRow'
import { Hotkey } from 'ducks/game'
import { CardPlace } from '../CardPlace'

import { Card } from '../Card'

export default {
  title: 'Ligretto / CardHotkeyBadge',
}

export const DefaultView = () => (
  <CardsRow>
    <CardHotkeyBadge hotkey={Hotkey.x}>
      <CardPlace>
        <Card color={CardColors.blue} value={1} />
      </CardPlace>
    </CardHotkeyBadge>
    <CardHotkeyBadge hotkey={Hotkey.space}>
      <CardPlace>
        <Card color={CardColors.red} value={5} />
      </CardPlace>
    </CardHotkeyBadge>
    <CardHotkeyBadge hotkey={Hotkey.q}>
      <CardPlace>
        <Card color={CardColors.yellow} value={7} />
      </CardPlace>
    </CardHotkeyBadge>
  </CardsRow>
)
