import { OnboardingStep } from '#features/onboarding'

/**
 * Game zones that Layer can raise above the dimming Overlay.
 */
export type LayerId = 'playerCards' | 'playgroundCards' | 'opponent'

/** Player card zones the hand-drawn OnboardingOutline can be wrapped around. */
export type OutlineTargetId = 'stack' | 'row' | 'ligretto'

/** Elements a description bubble can be anchored to and point at. */
export type DescriptionTargetId = 'stack' | 'row' | 'ligretto' | 'playground' | 'opponentDeck' | 'card0' | 'card1' | 'card2'

/**
 * Wide-screen placement of a description bubble. Narrow screens always fall
 * back to the shared bottom-anchored variant (above the player's cards panel).
 */
export type DescriptionPlacement =
  /** Bubble right above the target, arrow straight down. */
  | { mode: 'aboveTarget'; offset: number; twist?: number }
  /**
   * Bubble parked beside the playground. Vertically it hangs above the target
   * (a target in the player's panel), or — with `isLevelWithTarget` — is
   * centred on the target itself (a target on the board).
   */
  | { mode: 'besidePlayground'; side: 'left' | 'right'; isLevelWithTarget?: boolean }
  /** The playground step itself: beside the board, or in the band above it. */
  | { mode: 'playground' }

export interface AnchoredStepDescription {
  kind: 'anchored'
  text: string
  target: DescriptionTargetId
  placement: DescriptionPlacement
  /** Narrow fallback: the target sits on the board, above the bottom-anchored bubble. */
  isTargetAbove?: boolean
}

export type StepDescription =
  /** Special case — a centered bubble with an arrow to each opponent. */
  { kind: 'opponents'; text: string } | AnchoredStepDescription

/**
 * Presentation of an onboarding step. Which moves are *available* is not
 * described here — that is derived from the FSM (see `allowedEvents` in the
 * onboarding state); the config only says what the step looks like.
 */
export interface StepConfig {
  /** Zones raised above the Overlay on this step */
  raisedLayers: ReadonlyArray<LayerId>
  isOverlayHidden: boolean
  isNextButtonVisible: boolean
  isLigrettoHighlighted: boolean
  isStackDeckHighlighted: boolean
  isResultVisible: boolean
  /** Zone circled by the hand-drawn outline on this step */
  outlineTarget: OutlineTargetId | null
  description: StepDescription | null
}

const baseStepConfig: StepConfig = {
  raisedLayers: [],
  isOverlayHidden: false,
  isNextButtonVisible: false,
  isLigrettoHighlighted: false,
  isStackDeckHighlighted: false,
  isResultVisible: false,
  outlineTarget: null,
  description: null,
}

const CYCLED_INFO_TEXT = 'Карты в стеке закончились — они перелистаются заново'

export const STEP_CONFIGS: Record<OnboardingStep, StepConfig> = {
  [OnboardingStep.Opponents]: {
    ...baseStepConfig,
    raisedLayers: ['opponent'],
    isNextButtonVisible: true,
    description: { kind: 'opponents', text: 'Это твои соперники' },
  },
  [OnboardingStep.Playground]: {
    ...baseStepConfig,
    raisedLayers: ['playgroundCards'],
    isNextButtonVisible: true,
    description: {
      kind: 'anchored',
      target: 'playground',
      placement: { mode: 'playground' },
      isTargetAbove: true,
      text: 'Это общий стол.\nСюда будем выкладывать карты',
    },
  },
  [OnboardingStep.Cards]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    description: { kind: 'anchored', target: 'row', placement: { mode: 'aboveTarget', offset: 160 }, text: 'Это твои карты' },
  },
  [OnboardingStep.Stack]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    isStackDeckHighlighted: true,
    outlineTarget: 'stack',
    description: { kind: 'anchored', target: 'stack', placement: { mode: 'aboveTarget', offset: 128 }, text: 'Это твои карты в руке' },
  },
  [OnboardingStep.Row]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    outlineTarget: 'row',
    description: { kind: 'anchored', target: 'row', placement: { mode: 'aboveTarget', offset: 156, twist: 0.1 }, text: 'Это твои карты в ряду' },
  },
  [OnboardingStep.Ligretto]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    outlineTarget: 'ligretto',
    description: {
      kind: 'anchored',
      target: 'ligretto',
      placement: { mode: 'aboveTarget', offset: 128, twist: -0.7 },
      text: 'Это твоя колода Лигретто',
    },
  },
  [OnboardingStep.FirstCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    description: {
      kind: 'anchored',
      target: 'card0',
      placement: { mode: 'besidePlayground', side: 'left' },
      text: 'Единица любого цвета выкладывается на свободное место одним нажатием. Давай выложим первую карту!',
    },
  },
  [OnboardingStep.LigrettoCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isLigrettoHighlighted: true,
    description: {
      kind: 'anchored',
      target: 'ligretto',
      placement: { mode: 'besidePlayground', side: 'right' },
      text: 'Карты из колоды Лигретто нужно выкладывать на свободное место в ряду. Раунд закончится, как только первый из игроков выложит все карты из колоды Лигретто.',
    },
  },
  [OnboardingStep.StackCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isStackDeckHighlighted: true,
    description: {
      kind: 'anchored',
      target: 'stack',
      placement: { mode: 'besidePlayground', side: 'left' },
      text: 'Если из ряда выложить нечего, воспользуйся колодой в руке',
    },
  },
  [OnboardingStep.StackUnavailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isStackDeckHighlighted: true,
    description: {
      kind: 'anchored',
      target: 'stack',
      placement: { mode: 'besidePlayground', side: 'left' },
      text: 'Выкладывать на стол можно только карту того же цвета следующую по номиналу (или единицу на свободное место). Давай искать подходящую карту в руке дальше',
    },
  },
  [OnboardingStep.StackAvailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    description: {
      kind: 'anchored',
      target: 'stack',
      placement: { mode: 'aboveTarget', offset: 128 },
      text: 'Выбери карту, затем нажми на подходящую синюю стопку на столе',
    },
  },
  [OnboardingStep.RowAvailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    description: {
      kind: 'anchored',
      target: 'card1',
      placement: { mode: 'besidePlayground', side: 'left' },
      text: 'Выбери подходящую карту в ряду, затем нажми на синюю стопку на столе',
    },
  },
  [OnboardingStep.LigrettoAvailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isLigrettoHighlighted: true,
    description: {
      kind: 'anchored',
      target: 'ligretto',
      placement: { mode: 'besidePlayground', side: 'right' },
      text: 'Освободилось место в ряду. Выкладывай из колоды Лигретто',
    },
  },
  [OnboardingStep.GameStarted]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards', 'opponent'],
    isOverlayHidden: true,
  },
  [OnboardingStep.GameStartedCycledInfo]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards', 'opponent'],
    isOverlayHidden: true,
    description: { kind: 'anchored', target: 'stack', placement: { mode: 'besidePlayground', side: 'left' }, text: CYCLED_INFO_TEXT },
  },
  [OnboardingStep.OpponentTurn]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    isStackDeckHighlighted: true,
    description: {
      kind: 'anchored',
      target: 'opponentDeck',
      placement: { mode: 'besidePlayground', side: 'right', isLevelWithTarget: true },
      isTargetAbove: true,
      text: 'Соперник выложил карту на стол. Полистай колоду в руке',
    },
  },
  [OnboardingStep.OpponentTurnSecondCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    description: {
      kind: 'anchored',
      target: 'card2',
      placement: { mode: 'besidePlayground', side: 'left' },
      text: 'Выбери зелёную тройку, затем нажми на зелёную стопку соперника',
    },
  },
  [OnboardingStep.OpponentTurnCycledInfo]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    description: { kind: 'anchored', target: 'stack', placement: { mode: 'besidePlayground', side: 'left' }, text: CYCLED_INFO_TEXT },
  },
  [OnboardingStep.FinalLigrettoCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    isLigrettoHighlighted: true,
    description: {
      kind: 'anchored',
      target: 'ligretto',
      placement: { mode: 'besidePlayground', side: 'right' },
      text: 'Освободилось место в ряду. Выкладывай карту из колоды Лигретто!',
    },
  },
  [OnboardingStep.Result]: {
    ...baseStepConfig,
    isOverlayHidden: true,
    isResultVisible: true,
  },
}
