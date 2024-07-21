import { GameLayout } from '#shared/ui/layouts/game/GameLayout'
import { GameGrid } from '#widgets/game/ui/GameGrid/GameGrid'
import { Playground } from '#features/playground/ui/Playground'
import { LigrettoPack, Opponent } from '#features/player'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { CardsPanel } from '#features/player/ui/CardsPanel/CardsPanel'
import { onboardingGame, putLigrettoAction } from '#features/onboarding/model/slice'
import { useDispatch, useSelector } from 'react-redux'
import { useCallback } from 'react'
import { Overlay } from '#shared/ui/Overlay'

const OnboardingCardPanel = () => {
  const game = useSelector(onboardingGame)
  const dispatch = useDispatch()
  const current = game.players.id0
  const handleLigrettoDeckCardClick = useCallback(() => {
    dispatch(putLigrettoAction())
  }, [dispatch])

  return (
    <CardsPanel player={{ status: PlayerStatus.InGame, username: 'you' }}>
      <LigrettoPack
        count={current?.ligrettoDeck.cards.length ?? 0}
        isDndEnabled={false}
        ligrettoDeckCards={current?.ligrettoDeck.cards ?? []}
        onLigrettoDeckCardClick={handleLigrettoDeckCardClick}
      />
    </CardsPanel>
  )
}

export function OnboardingPage() {
  const game = useSelector(onboardingGame)
  const opponents = Object.values(game.players).flatMap(player =>
    player && !player.isHost
      ? [
          {
            ...player,
            stackOpenDeckCards: [],
            username: player.id,
          },
        ]
      : [],
  )
  return (
    <GameLayout>
      <Overlay />
      <GameGrid centerElement={<Playground cardsDecks={[]} onDeckClick={() => null} />} bottomElement={<OnboardingCardPanel />}>
        {opponents.map(props => (
          <Opponent key={props.id} {...props} />
        ))}
      </GameGrid>
    </GameLayout>
  )
}
