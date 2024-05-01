import { GameLayout } from '#shared/ui/layouts/game/GameLayout'
import { GameGrid } from '#widgets/game/ui/GameGrid/GameGrid'
import { Playground } from '#features/playground/ui/Playground'
import type { OpponentCardsProps } from '#features/player'
import { Opponent } from '#features/player'
import { PlayerStatus, CardColors } from '@memebattle/ligretto-shared'
import { CardsPanel } from '#features/player/ui/CardsPanel/CardsPanel.js'
import { Overlay } from '#shared/ui/Overlay'
import { useEffect, useRef } from 'react'

const opponents: Array<OpponentCardsProps> = [
  {
    id: 'id1',
    username: 'user1',
    stackOpenDeckCards: [],
    cards: [
      { value: 5, color: CardColors.blue },
      { value: 5, color: CardColors.blue },
      { value: 5, color: CardColors.blue },
    ],
    status: PlayerStatus.InGame,
  },
  {
    id: 'id2',
    username: 'user2',
    stackOpenDeckCards: [],
    cards: [
      { value: 5, color: CardColors.blue },
      { value: 5, color: CardColors.blue },
      { value: 5, color: CardColors.blue },
    ],
    status: PlayerStatus.InGame,
  },
  {
    id: 'id3',
    username: 'user3',
    stackOpenDeckCards: [],
    cards: [
      { value: 5, color: CardColors.blue },
      { value: 5, color: CardColors.blue },
      { value: 5, color: CardColors.blue },
    ],
    status: PlayerStatus.InGame,
  },
]

export function OnboardingPage() {
  const ref = useRef()

  useEffect(() => {
    console.log(ref)
  }, [])

  return (
    <GameLayout>
      <Overlay />
      <GameGrid
        centerElement={<Playground cardsDecks={[]} onDeckClick={() => null} />}
        bottomElement={<CardsPanel player={{ status: PlayerStatus.ReadyToPlay, username: 'you' }} />}
      >
        {opponents.map(props => (
          <Opponent ref={ref} key={props.id} {...props} />
        ))}
      </GameGrid>
    </GameLayout>
  )
}
