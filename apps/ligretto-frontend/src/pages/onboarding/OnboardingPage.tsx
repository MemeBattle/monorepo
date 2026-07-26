import { useCallback, useMemo, useRef, type RefObject } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Box, IconButton } from '@memebattle/ui'

import { GameLayout } from '#shared/ui/layouts/game/GameLayout'
import { GameGrid } from '#widgets/game/ui/GameGrid/GameGrid'
import { Playground } from '#features/playground/ui/Playground'
import { LigrettoPack, Opponent } from '#features/player'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { CardsPanel } from '#features/player/ui/CardsPanel/CardsPanel'
import {
  onboardingGameSelector,
  putLigrettoCardAction,
  nextStepOnboardingAction,
  nextStackCardAction,
  onboardingStepSelector,
  putStackCardAction,
} from '#features/onboarding'
import { Overlay } from '#shared/ui/Overlay'
import { NextButton } from '#shared/ui/NextButton/NextButton.js'
import { CardsStack } from '#entities/card'

import type { OutlineTargetId } from './stepConfig'
import { STEP_CONFIGS } from './stepConfig'
import { PlayerRowCards } from './PlayerRowCards'
import { Layer } from './Layer'
import { TargetOutline } from './TargetOutline'
import { TouchHint } from './TouchHint'
import { OnboardingTargetsProvider, useOnboardingContainerRef } from './targets'
import { ResultScreen } from './ResultScreen'
import { PlaygroundDescription } from './descriptions/PlaygroundDescription'
import { OpponentsDescription } from './descriptions/OpponentsDescription'
import { StackDescription } from './descriptions/StackDescription'
import { PlayerRowDescription } from './descriptions/PlayerRowDescription'
import { LigrettoDescription } from './descriptions/LigrettoDescription'
import { CardDescription } from './descriptions/CardDescription'
import { AllCardsDescription } from './descriptions/AllCardsDescription'
import { OpponentMoveDescription } from './descriptions/OpponentMoveDescription'

interface OnboardingCardPanelProps {
  stackRef: RefObject<HTMLDivElement | null>
  playerRowRef: RefObject<HTMLDivElement | null>
  ligrettoRef: RefObject<HTMLDivElement | null>
  cardRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
}

const OnboardingCardPanel = ({ stackRef, playerRowRef, ligrettoRef, cardRefs }: OnboardingCardPanelProps) => {
  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)
  const config = STEP_CONFIGS[step]

  const dispatch = useDispatch()
  const current = game.players.id0
  const handleLigrettoDeckCardClick = useCallback(() => {
    dispatch(putLigrettoCardAction())
  }, [dispatch])

  return (
    <Layer id="playerCards">
      <CardsPanel player={{ status: PlayerStatus.InGame, username: 'you' }}>
        <CardsStack
          ref={stackRef}
          dataTestId="OnboardingPage-Stack"
          onStackDeckCardClick={() => dispatch(nextStackCardAction())}
          onStackOpenDeckCardClick={() => dispatch(putStackCardAction())}
          onStackDeckCardOutsideClick={() => undefined}
          isStackOpenDeckSelected={config.isStackOpenDeckSelected}
          isStackOpenDeckDarkened={false}
          isStackDeckHighlighted={config.isStackDeckHighlighted}
          stackOpenDeckCard={current?.stackOpenDeck.cards[0]}
          stackDeckCards={current?.stackDeck.cards ?? []}
        />
        <PlayerRowCards ref={playerRowRef} cardRefs={cardRefs} />
        <LigrettoPack
          ref={ligrettoRef}
          dataTestId="OnboardingPage-Ligretto"
          isDisabled={config.isLigrettoDisabled}
          count={current?.ligrettoDeck.cards.length ?? 0}
          isDndEnabled={false}
          ligrettoDeckCards={current?.ligrettoDeck.cards ?? []}
          onLigrettoDeckCardClick={handleLigrettoDeckCardClick}
          isHighlighted={config.isLigrettoHighlighted}
        />
      </CardsPanel>
    </Layer>
  )
}

const OPPONENT_COUNT = 3

function OnboardingPageBody() {
  const dispatch = useDispatch()
  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)
  const config = STEP_CONFIGS[step]
  const containerRef = useOnboardingContainerRef()

  const playgroundRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const playerRowRef = useRef<HTMLDivElement | null>(null)
  const ligrettoRef = useRef<HTMLDivElement | null>(null)
  const card0Ref = useRef<HTMLDivElement | null>(null)
  const card1Ref = useRef<HTMLDivElement | null>(null)
  const card2Ref = useRef<HTMLDivElement | null>(null)
  const cardRefs = useMemo(
    () => [card0Ref, card1Ref, card2Ref] as [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>],
    [],
  )
  const opponent0Ref = useRef<HTMLDivElement | null>(null)
  const opponent1Ref = useRef<HTMLDivElement | null>(null)
  const opponent2Ref = useRef<HTMLDivElement | null>(null)
  const opponentDeckRef = useRef<HTMLDivElement | null>(null)
  const playgroundDeckRefs = useMemo<Array<RefObject<HTMLDivElement | null> | undefined>>(() => {
    const refs = new Array<RefObject<HTMLDivElement | null> | undefined>(12)
    refs[2] = opponentDeckRef
    return refs
  }, [])

  const opponentsRefs = [opponent0Ref, opponent1Ref, opponent2Ref] as const

  const outlineRefs = useMemo<Record<OutlineTargetId, RefObject<HTMLDivElement | null>>>(
    () => ({ stack: stackRef, row: playerRowRef, ligretto: ligrettoRef }),
    [],
  )

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

  const handleNextButtonClick = useCallback(() => {
    dispatch(nextStepOnboardingAction())
  }, [dispatch])

  const description = config.description

  return (
    <GameLayout>
      <Box
        ref={containerRef as RefObject<HTMLDivElement>}
        data-test-id="OnboardingPage"
        data-onboarding-step={step}
        sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        <GameGrid
          centerElement={
            <Layer id="playgroundCards">
              <Playground ref={playgroundRef} cardsDecks={game.playground.decks} onDeckClick={() => null} deckRefs={playgroundDeckRefs} />
            </Layer>
          }
          bottomElement={<OnboardingCardPanel stackRef={stackRef} playerRowRef={playerRowRef} ligrettoRef={ligrettoRef} cardRefs={cardRefs} />}
        >
          {opponents.slice(0, OPPONENT_COUNT).map((props, index) => (
            <Layer key={props.id} id="opponent">
              <Opponent ref={opponentsRefs[index]} {...props} />
            </Layer>
          ))}
        </GameGrid>
        {config.isOverlayHidden ? null : <Overlay />}

        {config.outlineTarget ? <TargetOutline targetRef={outlineRefs[config.outlineTarget]} /> : null}

        {description?.kind === 'playground' ? <PlaygroundDescription text={description.text} targetRef={playgroundRef} /> : null}
        {description?.kind === 'opponents' ? (
          <OpponentsDescription text={description.text} opponent0Ref={opponent0Ref} opponent1Ref={opponent1Ref} opponent2Ref={opponent2Ref} />
        ) : null}
        {description?.kind === 'allCards' ? <AllCardsDescription text={description.text} playerRowRef={playerRowRef} /> : null}
        {description?.kind === 'stack' ? (
          <StackDescription
            text={description.text}
            targetRef={stackRef}
            playgroundRef={playgroundRef}
            isPlaygroundAnchored={description.isPlaygroundAnchored}
          />
        ) : null}
        {description?.kind === 'row' ? <PlayerRowDescription text={description.text} targetRef={playerRowRef} /> : null}
        {description?.kind === 'ligretto' ? (
          <LigrettoDescription
            text={description.text}
            targetRef={ligrettoRef}
            playgroundRef={playgroundRef}
            isPlaygroundAnchored={description.isPlaygroundAnchored}
          />
        ) : null}
        {description?.kind === 'card' ? (
          <CardDescription text={description.text} targetRef={cardRefs[description.cardIndex]} playgroundRef={playgroundRef} />
        ) : null}
        {description?.kind === 'opponentMove' ? <OpponentMoveDescription text={description.text} targetRef={opponentDeckRef} /> : null}

        {config.isResultVisible ? <ResultScreen /> : null}

        {config.isNextButtonVisible ? (
          <Box sx={{ position: 'absolute', right: '2rem', top: '2rem', zIndex: 3 }}>
            <TouchHint key={step}>
              <IconButton data-test-id="OnboardingPage-NextButton" onClick={handleNextButtonClick}>
                <NextButton />
              </IconButton>
            </TouchHint>
          </Box>
        ) : null}
      </Box>
    </GameLayout>
  )
}

export function OnboardingPage() {
  return (
    <OnboardingTargetsProvider>
      <OnboardingPageBody />
    </OnboardingTargetsProvider>
  )
}
