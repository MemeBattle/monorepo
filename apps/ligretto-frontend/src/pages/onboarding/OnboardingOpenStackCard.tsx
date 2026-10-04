import type { Card as PlayerCard } from '@memebattle/ligretto-shared'

import { Card, CardHotkeyBadge, CardPlace } from '#entities/card'
import { useCardInteraction, useDraggableCard } from '#features/cardInteraction'

/** The open-stack card while the step lets the player move it: picked by a press or dragged, like in the game. */
const PlayableOpenStackCard = ({ card }: { card: PlayerCard }) => {
  const { id, isActive, isDimmed, isDragging, listeners, setNodeRef, toggleActiveTarget } = useDraggableCard({ type: 'open-stack' }, card)

  return (
    <Card
      {...card}
      {...listeners}
      ref={setNodeRef}
      data-card-drag-source
      data-card-drag-id={id}
      data-card-interaction-element
      data-card-active={isActive}
      isDarkened={isDimmed}
      isSelected={isActive}
      isInvisible={isDragging}
      onClick={toggleActiveTarget}
    />
  )
}

/** The open-stack card while the step does not let the player move it. Its unmount drops the selection. */
const IdleOpenStackCard = ({ card }: { card: PlayerCard }) => {
  const { isDimmed } = useCardInteraction({ type: 'open-stack' })

  return <Card {...card} data-card-interaction-element isDarkened={isDimmed} isDisabled />
}

interface OnboardingOpenStackCardProps {
  card?: PlayerCard
  isActive: boolean
}

export const OnboardingOpenStackCard = ({ card, isActive }: OnboardingOpenStackCardProps) => (
  <CardPlace dataTestId="OnboardingPage-Stack-OpenDeck">
    {card && <CardHotkeyBadge>{isActive ? <PlayableOpenStackCard card={card} /> : <IdleOpenStackCard card={card} />}</CardHotkeyBadge>}
  </CardPlace>
)
