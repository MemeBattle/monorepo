import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { CardColors } from '@memebattle/ligretto-shared'
import { CardInteractionProvider, useCardInteraction, useDroppableTarget } from '#features/cardInteraction'
import { PlayerRowCardsContainer } from '#features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer'

// Render the production row and sensors without a backend or random deal.
const store = configureStore({
  reducer: () => ({
    auth: { userId: 'player' },
    game: { game: { players: { player: { cards: [{ color: CardColors.blue, value: 1 }] } } } },
  }),
})

const Destination = () => {
  const [drops, setDrops] = useState(0)
  const { activeTarget } = useCardInteraction()
  const { setNodeRef, onClick } = useDroppableTarget({ type: 'playground', index: 0 }, () => setDrops(count => count + 1))

  return (
    <>
      <output data-test-id="selection">{activeTarget?.type ?? 'none'}</output>
      <button ref={setNodeRef} onClick={onClick} data-card-interaction-element style={{ display: 'block', width: 100, height: 100, marginTop: 80 }}>
        Drops: {drops}
      </button>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <CardInteractionProvider enabled>
      <div style={{ padding: 40 }}>
        <PlayerRowCardsContainer />
        <Destination />
      </div>
    </CardInteractionProvider>
  </Provider>,
)
