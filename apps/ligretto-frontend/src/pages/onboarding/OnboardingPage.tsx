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
  OnboardingStep,
  onboardingStepSelector,
  putStackCardAction,
} from '#features/onboarding'
import { Overlay } from '#shared/ui/Overlay'
import { NextButton } from '#shared/ui/NextButton/NextButton.js'
import { CardsStack } from '#entities/card'

import { PlayerRowCards } from './PlayerRowCards'
import { Layer } from './Layer'
import { TouchHint } from './TouchHint'
import { OnboardingTargetsProvider, useOnboardingContainerRef } from './targets'
import { ResultScreen } from './ResultScreen'
import { PlaygroundDescription } from './descriptions/PlaygroundDescription'
import { OpponentsDescription } from './descriptions/OpponentsDescription'
import { StackDescription } from './descriptions/StackDescription'
import { PlayerRowDescription } from './descriptions/PlayerRowDescription'
import { LigrettoDescription } from './descriptions/LigrettoDescription'
import { CardDescription } from './descriptions/CardDescription'
import { CenteredDescription } from './descriptions/CenteredDescription'
import { AllCardsDescription } from './descriptions/AllCardsDescription'
import { OpponentMoveDescription } from './descriptions/OpponentMoveDescription'

const isLigrettoPackHighlighted = (step: OnboardingStep): boolean =>
  step === OnboardingStep.LigrettoAvailableCard || step === OnboardingStep.LigrettoCard || step === OnboardingStep.OpponentTurn

const DISABLED_LIGRETTO_STEPS = new Set<OnboardingStep>([
  OnboardingStep.Opponents,
  OnboardingStep.Playground,
  OnboardingStep.Cards,
  OnboardingStep.Stack,
  OnboardingStep.Row,
  OnboardingStep.Ligretto,
  OnboardingStep.FirstCard,
  OnboardingStep.StackCard,
  OnboardingStep.StackUnavailableCard,
  OnboardingStep.StackAvailableCard,
  OnboardingStep.RowAvailableCard,
  OnboardingStep.GameStarted,
  OnboardingStep.GameStartedCycledInfo,
])

const STACK_DESCRIPTION_STEPS = new Set<OnboardingStep>([
  OnboardingStep.Stack,
  OnboardingStep.StackCard,
  OnboardingStep.StackUnavailableCard,
  OnboardingStep.StackAvailableCard,
])

const PLAYER_ROW_DESCRIPTION_STEPS = new Set<OnboardingStep>([OnboardingStep.Row])

const LIGRETTO_DESCRIPTION_STEPS = new Set<OnboardingStep>([
  OnboardingStep.Ligretto,
  OnboardingStep.LigrettoCard,
  OnboardingStep.LigrettoAvailableCard,
])

const CENTERED_DESCRIPTION_STEPS = new Set<OnboardingStep>([OnboardingStep.GameStartedCycledInfo, OnboardingStep.OpponentTurnCycledInfo])

const OVERLAY_HIDDEN_STEPS = new Set<OnboardingStep>([
  OnboardingStep.GameStarted,
  OnboardingStep.GameStartedCycledInfo,
  OnboardingStep.OpponentTurn,
  OnboardingStep.OpponentTurnCycledInfo,
  OnboardingStep.Result,
])

interface OnboardingCardPanelProps {
  stackRef: RefObject<HTMLDivElement | null>
  playerRowRef: RefObject<HTMLDivElement | null>
  ligrettoRef: RefObject<HTMLDivElement | null>
  cardRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
}

const OnboardingCardPanel = ({ stackRef, playerRowRef, ligrettoRef, cardRefs }: OnboardingCardPanelProps) => {
  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)

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
          onStackDeckCardClick={() => dispatch(nextStackCardAction())}
          onStackOpenDeckCardClick={() => dispatch(putStackCardAction())}
          onStackDeckCardOutsideClick={() => undefined}
          isStackOpenDeckSelected={step === OnboardingStep.StackAvailableCard}
          isStackOpenDeckDarkened={false}
          isStackDeckHighlighted={step === OnboardingStep.Stack || step === OnboardingStep.StackCard || step === OnboardingStep.StackUnavailableCard}
          stackOpenDeckCard={current?.stackOpenDeck.cards[0]}
          stackDeckCards={current?.stackDeck.cards ?? []}
        />
        <PlayerRowCards ref={playerRowRef} cardRefs={cardRefs} />
        <LigrettoPack
          ref={ligrettoRef}
          isDisabled={DISABLED_LIGRETTO_STEPS.has(step)}
          count={current?.ligrettoDeck.cards.length ?? 0}
          isDndEnabled={false}
          ligrettoDeckCards={current?.ligrettoDeck.cards ?? []}
          onLigrettoDeckCardClick={handleLigrettoDeckCardClick}
          isHighlighted={isLigrettoPackHighlighted(step)}
        />
      </CardsPanel>
    </Layer>
  )
}

const ONBOARDING_STEPS_VISIBLE_NEXT_BUTTON = new Set<OnboardingStep>([
  OnboardingStep.Opponents,
  OnboardingStep.Playground,
  OnboardingStep.Cards,
  OnboardingStep.Stack,
  OnboardingStep.Row,
  OnboardingStep.Ligretto,
])

const isNextButtonVisible = (currentStep: OnboardingStep): boolean => ONBOARDING_STEPS_VISIBLE_NEXT_BUTTON.has(currentStep)

const OPPONENT_COUNT = 3

function OnboardingPageBody() {
  const dispatch = useDispatch()
  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)
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

  return (
    <GameLayout>
      <Box ref={containerRef as RefObject<HTMLDivElement>} sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
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
        {OVERLAY_HIDDEN_STEPS.has(step) ? null : <Overlay />}

        {step === OnboardingStep.Playground ? <PlaygroundDescription targetRef={playgroundRef} /> : null}
        {step === OnboardingStep.Opponents ? (
          <OpponentsDescription opponent0Ref={opponent0Ref} opponent1Ref={opponent1Ref} opponent2Ref={opponent2Ref} />
        ) : null}
        {step === OnboardingStep.Cards ? <AllCardsDescription playerRowRef={playerRowRef} /> : null}
        {STACK_DESCRIPTION_STEPS.has(step) ? <StackDescription targetRef={stackRef} playgroundRef={playgroundRef} /> : null}
        {PLAYER_ROW_DESCRIPTION_STEPS.has(step) ? <PlayerRowDescription targetRef={playerRowRef} /> : null}
        {LIGRETTO_DESCRIPTION_STEPS.has(step) ? <LigrettoDescription targetRef={ligrettoRef} playgroundRef={playgroundRef} /> : null}
        {step === OnboardingStep.FirstCard ? <CardDescription index={0} targetRef={card0Ref} playgroundRef={playgroundRef} /> : null}
        {step === OnboardingStep.RowAvailableCard ? <CardDescription index={1} targetRef={card1Ref} playgroundRef={playgroundRef} /> : null}
        {step === OnboardingStep.OpponentTurn ? <OpponentMoveDescription targetRef={opponentDeckRef} /> : null}
        {CENTERED_DESCRIPTION_STEPS.has(step) ? <CenteredDescription /> : null}

        <ResultScreen />

        {isNextButtonVisible(step) ? (
          <Box sx={{ position: 'absolute', right: '2rem', top: '2rem', zIndex: 3 }}>
            <TouchHint key={step}>
              <IconButton onClick={handleNextButtonClick}>
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
