import { useCallback, useMemo, useRef, type RefObject } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Box, IconButton } from '@memebattle/ui'
import CachedIcon from '@mui/icons-material/Cached'

import { GameLayout } from '#shared/ui/layouts/game/GameLayout'
import { GameGrid } from '#widgets/game/ui/GameGrid/GameGrid'
import { Playground } from '#features/playground/ui/Playground'
import { LigrettoPack, Opponent } from '#features/player'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { CardsPanel } from '#features/player/ui/CardsPanel/CardsPanel'
import {
  OnboardingEvent,
  OPPONENT_DECK_INDEX,
  ONBOARDING_PLAYER_NAMES,
  onboardingAllowedEventsSelector,
  onboardingGameSelector,
  putLigrettoCardAction,
  nextStepOnboardingAction,
  nextStackCardAction,
  onboardingStepSelector,
  putStackCardAction,
} from '#features/onboarding'
import { Overlay } from '#shared/ui/Overlay'
import { NextButton } from '#shared/ui/NextButton/NextButton.js'
import { Card, CardHotkeyBadge, CardPlace } from '#entities/card'
import { CardsRow } from '#entities/card/ui/CardsRow'

import type { OutlineTargetId } from './stepConfig'
import { STEP_CONFIGS } from './stepConfig'
import { PlayerRowCards } from './PlayerRowCards'
import { Layer } from './Layer'
import { TargetOutline } from './TargetOutline'
import { TouchHint } from './TouchHint'
import { OnboardingTargetsProvider, useOnboardingCardsPanelRef, useOnboardingContainerRef } from './targets'
import { ResultScreen } from './ResultScreen'
import { OpponentsDescription } from './descriptions/OpponentsDescription'
import { AnchoredDescription, type DescriptionTargets } from './descriptions/AnchoredDescription'
import { CardFocusProvider, useCardFocus } from '#features/cardFocus'
import { getOnboardingPlacementAction } from './onboardingPlacement'

interface OnboardingCardPanelProps {
  stackRef: RefObject<HTMLDivElement | null>
  playerRowRef: RefObject<HTMLDivElement | null>
  ligrettoRef: RefObject<HTMLDivElement | null>
  cardRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
}

const OnboardingCardPanel = ({ stackRef, playerRowRef, ligrettoRef, cardRefs }: OnboardingCardPanelProps) => {
  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)
  const allowedEvents = useSelector(onboardingAllowedEventsSelector)
  const config = STEP_CONFIGS[step]
  const cardsPanelRef = useOnboardingCardsPanelRef()

  const dispatch = useDispatch()
  const current = game.players.id0
  const openStackCard = current?.stackOpenDeck.cards[0]
  const { isFocused, isDimmed, toggleFocus } = useCardFocus({ type: 'open-stack' }, [openStackCard?.color, openStackCard?.value])
  const handleLigrettoDeckCardClick = useCallback(() => {
    dispatch(putLigrettoCardAction())
  }, [dispatch])
  const handleOpenStackCardClick = useCallback(() => {
    if (!openStackCard || !allowedEvents.includes(OnboardingEvent.PutStackCard)) {
      return
    }
    if (openStackCard.value === 1) {
      dispatch(putStackCardAction())
      return
    }
    toggleFocus()
  }, [allowedEvents, dispatch, openStackCard, toggleFocus])

  return (
    <Layer id="playerCards" ref={cardsPanelRef}>
      <CardsPanel
        player={{ status: PlayerStatus.InGame, username: ONBOARDING_PLAYER_NAMES.id0 }}
        stack={
          <CardsRow ref={stackRef} dataTestId="OnboardingPage-Stack">
            <CardHotkeyBadge>
              <CardPlace dataTestId="OnboardingPage-Stack-OpenDeck">
                {openStackCard && (
                  <Card
                    {...openStackCard}
                    data-card-focus-element
                    data-card-focused={isFocused}
                    isDarkened={isDimmed}
                    isDisabled={!allowedEvents.includes(OnboardingEvent.PutStackCard)}
                    isSelected={isFocused}
                    onClick={handleOpenStackCardClick}
                  />
                )}
              </CardPlace>
            </CardHotkeyBadge>
            <CardHotkeyBadge>
              <CardPlace dataTestId="OnboardingPage-Stack-Deck">
                <Card
                  {...current?.stackDeck.cards[0]}
                  isHidden={(current?.stackDeck.isHidden ?? true) && (current?.stackDeck.cards.length ?? 0) > 0}
                  isHighlighted={config.isStackDeckHighlighted}
                  onClick={() => dispatch(nextStackCardAction())}
                />
                {current?.stackDeck.cards.length === 0 && current.stackOpenDeck.cards[0] ? (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      pointerEvents: 'none',
                    }}
                  >
                    <CachedIcon fontSize="large" />
                  </Box>
                ) : null}
              </CardPlace>
            </CardHotkeyBadge>
          </CardsRow>
        }
        rowCards={<PlayerRowCards ref={playerRowRef} cardRefs={cardRefs} />}
        ligretto={
          <LigrettoPack
            ref={ligrettoRef}
            dataTestId="OnboardingPage-Ligretto"
            isDisabled={!allowedEvents.includes(OnboardingEvent.PutLigretto)}
            count={current?.ligrettoDeck.cards.length ?? 0}

            ligrettoDeckCards={current?.ligrettoDeck.cards ?? []}
            isDeckHidden={current?.ligrettoDeck.isHidden ?? true}
            onLigrettoDeckCardClick={handleLigrettoDeckCardClick}
            isHighlighted={config.isLigrettoHighlighted}
          />
        }
      />
    </Layer>
  )
}

const OPPONENT_COUNT = 3

function OnboardingPageBody() {
  const dispatch = useDispatch()
  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)
  const allowedEvents = useSelector(onboardingAllowedEventsSelector)
  const { focusedCard } = useCardFocus()
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
  // The only playground deck a hint ever points at is the opponent's green one.
  const playgroundDeckRefs = useMemo<Array<RefObject<HTMLDivElement | null> | undefined>>(() => {
    const refs: Array<RefObject<HTMLDivElement | null> | undefined> = []
    refs[OPPONENT_DECK_INDEX] = opponentDeckRef
    return refs
  }, [])

  const opponentsRefs = [opponent0Ref, opponent1Ref, opponent2Ref] as const

  const outlineRefs = useMemo<Record<OutlineTargetId, RefObject<HTMLDivElement | null>>>(
    () => ({ stack: stackRef, row: playerRowRef, ligretto: ligrettoRef }),
    [],
  )

  const descriptionTargets = useMemo<DescriptionTargets>(
    () => ({
      stack: stackRef,
      row: playerRowRef,
      ligretto: ligrettoRef,
      playground: playgroundRef,
      opponentDeck: opponentDeckRef,
      card0: card0Ref,
      card1: card1Ref,
      card2: card2Ref,
    }),
    [],
  )

  const opponents = Object.values(game.players).flatMap(player =>
    player && !player.isHost
      ? [
          {
            ...player,
            stackOpenDeckCards: [],
            username: ONBOARDING_PLAYER_NAMES[player.id as keyof typeof ONBOARDING_PLAYER_NAMES] ?? player.id,
          },
        ]
      : [],
  )

  const handleNextButtonClick = useCallback(() => {
    dispatch(nextStepOnboardingAction())
  }, [dispatch])
  const handlePlaygroundDeckClick = useCallback(
    (playgroundDeckIndex: number) => {
      const action = getOnboardingPlacementAction(focusedCard, allowedEvents, playgroundDeckIndex)
      if (action) {
        dispatch(action)
      }
    },
    [allowedEvents, dispatch, focusedCard],
  )

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
            // Below the `md` breakpoint MobileGameGrid stacks zones in a column; the extra top
            // margin and the auto margin pin the player's cards to the bottom of the screen, and
            // the slack between them and the playground is where the hints go.
            <Box sx={{ marginTop: { xs: '1.5rem', md: 0 } }}>
              <Layer id="playgroundCards">
                <Playground
                  ref={playgroundRef}
                  cardsDecks={game.playground.decks}
                  onDeckClick={handlePlaygroundDeckClick}
                  deckRefs={playgroundDeckRefs}
                />
              </Layer>
            </Box>
          }
          bottomElement={
            <Box sx={{ marginTop: { xs: 'auto', md: 0 } }}>
              <OnboardingCardPanel stackRef={stackRef} playerRowRef={playerRowRef} ligrettoRef={ligrettoRef} cardRefs={cardRefs} />
            </Box>
          }
        >
          {opponents.slice(0, OPPONENT_COUNT).map((props, index) => (
            <Layer key={props.id} id="opponent">
              <Opponent ref={opponentsRefs[index]} {...props} />
            </Layer>
          ))}
        </GameGrid>
        {config.isOverlayHidden ? null : <Overlay />}

        {config.outlineTarget ? <TargetOutline targetRef={outlineRefs[config.outlineTarget]} /> : null}

        {description?.kind === 'opponents' ? (
          <OpponentsDescription text={description.text} opponent0Ref={opponent0Ref} opponent1Ref={opponent1Ref} opponent2Ref={opponent2Ref} />
        ) : null}
        {description?.kind === 'anchored' ? <AnchoredDescription key={step} description={description} targets={descriptionTargets} /> : null}

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
      <CardFocusProvider enabled>
        <OnboardingPageBody />
      </CardFocusProvider>
    </OnboardingTargetsProvider>
  )
}
