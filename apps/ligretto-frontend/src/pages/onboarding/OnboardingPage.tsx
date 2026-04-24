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
import { useDispatch, useSelector } from 'react-redux'
import { useCallback } from 'react'
import { Overlay } from '#shared/ui/Overlay'
import { NextButton } from '#shared/ui/NextButton/NextButton.js'
import { Box, IconButton } from '@memebattle/ui'
import { CardsStack } from '#entities/card'
import { PlayerRowCards } from './PlayerRowCards'
import { Layer } from './Layer'
import { TouchHint } from './TouchHint'
import { Description } from './Description'
import { OnboardingTarget } from './OnboardingTarget'
import { OnboardingTargetsProvider } from './targets'
import { StepArrow } from './StepArrow'
import { ResultScreen } from './ResultScreen'

const isLigrettoPackHighlighted = (step: OnboardingStep): boolean =>
  step === OnboardingStep.LigrettoAvailableCard || step === OnboardingStep.LigrettoCard

const DISABLED_LIGRETTO_STEPS = new Set<OnboardingStep>([
  OnboardingStep.Opponents,
  OnboardingStep.Playground,
  OnboardingStep.Cards,
  OnboardingStep.Stack,
  OnboardingStep.Row,
  OnboardingStep.Ligretto,
  OnboardingStep.FirstCard,
])

const OnboardingCardPanel = () => {
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
        <OnboardingTarget id="stack">
          <CardsStack
            onStackDeckCardClick={() => dispatch(nextStackCardAction())}
            onStackOpenDeckCardClick={() => dispatch(putStackCardAction())}
            onStackDeckCardOutsideClick={() => undefined}
            isStackOpenDeckSelected={false}
            isStackOpenDeckDarkened={false}
            stackOpenDeckCard={current?.stackOpenDeck.cards[0]}
            stackDeckCards={current?.stackDeck.cards ?? []}
          />
        </OnboardingTarget>
        <OnboardingTarget id="playerRow">
          <PlayerRowCards />
        </OnboardingTarget>

        <OnboardingTarget id="ligretto">
          <LigrettoPack
            isDisabled={DISABLED_LIGRETTO_STEPS.has(step)}
            count={current?.ligrettoDeck.cards.length ?? 0}
            isDndEnabled={false}
            ligrettoDeckCards={current?.ligrettoDeck.cards ?? []}
            onLigrettoDeckCardClick={handleLigrettoDeckCardClick}
            isHighlighted={isLigrettoPackHighlighted(step)}
          />
        </OnboardingTarget>
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

export function OnboardingPage() {
  const dispatch = useDispatch()
  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)
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
    <OnboardingTargetsProvider>
      <GameLayout>
        <Box sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <GameGrid
            centerElement={
              <Layer id="playgroundCards">
                <OnboardingTarget id="playground">
                  <Playground cardsDecks={game.playground.decks} onDeckClick={() => null} />
                </OnboardingTarget>
              </Layer>
            }
            bottomElement={<OnboardingCardPanel />}
          >
            {opponents.map((props, index) => {
              const opponent = (
                <Layer id="opponent" key={props.id}>
                  <Opponent {...props} />
                </Layer>
              )
              return index === 0 ? (
                <OnboardingTarget key={props.id} id="opponents">
                  {opponent}
                </OnboardingTarget>
              ) : (
                opponent
              )
            })}
          </GameGrid>
          <Overlay />
          <Description />
          <StepArrow />
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
    </OnboardingTargetsProvider>
  )
}
