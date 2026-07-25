import { OnboardingStep } from '#features/onboarding'

/**
 * Game zones that Layer can raise above the dimming Overlay.
 */
export type LayerId = 'playerCards' | 'playgroundCards' | 'opponent'

export type StepDescription =
  | { kind: 'opponents'; text: string }
  | { kind: 'playground'; text: string }
  | { kind: 'allCards'; text: string }
  | { kind: 'stack'; text: string; isPlaygroundAnchored?: boolean }
  | { kind: 'row'; text: string }
  | { kind: 'ligretto'; text: string; isPlaygroundAnchored?: boolean }
  | { kind: 'card'; text: string; cardIndex: 0 | 1 | 2 }
  | { kind: 'opponentMove'; text: string }

/**
 * Full description of an onboarding step: every property of a step in one object.
 */
export interface StepConfig {
  /** Zones raised above the Overlay on this step */
  raisedLayers: ReadonlyArray<LayerId>
  isOverlayHidden: boolean
  isNextButtonVisible: boolean
  isLigrettoDisabled: boolean
  isLigrettoHighlighted: boolean
  isStackDeckHighlighted: boolean
  isStackOpenDeckSelected: boolean
  isFirstRowCardActive: boolean
  isSecondRowCardActive: boolean
  isThirdRowCardActive: boolean
  isResultVisible: boolean
  description: StepDescription | null
}

const baseStepConfig: StepConfig = {
  raisedLayers: [],
  isOverlayHidden: false,
  isNextButtonVisible: false,
  isLigrettoDisabled: true,
  isLigrettoHighlighted: false,
  isStackDeckHighlighted: false,
  isStackOpenDeckSelected: false,
  isFirstRowCardActive: false,
  isSecondRowCardActive: false,
  isThirdRowCardActive: false,
  isResultVisible: false,
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
    description: { kind: 'playground', text: 'Это общий стол.\nСюда будем выкладывать карты' },
  },
  [OnboardingStep.Cards]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    description: { kind: 'allCards', text: 'Это твои карты' },
  },
  [OnboardingStep.Stack]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    isStackDeckHighlighted: true,
    description: { kind: 'stack', text: 'Это твои карты в руке' },
  },
  [OnboardingStep.Row]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    description: { kind: 'row', text: 'Это твои карты в ряду' },
  },
  [OnboardingStep.Ligretto]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards'],
    isNextButtonVisible: true,
    description: { kind: 'ligretto', text: 'Это твоя колода ligretto' },
  },
  [OnboardingStep.FirstCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isFirstRowCardActive: true,
    description: {
      kind: 'card',
      cardIndex: 0,
      text: 'На свободное место на столе можно выкладывать единицу любого цвета. Давай выложим первую карту!',
    },
  },
  [OnboardingStep.LigrettoCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isLigrettoDisabled: false,
    isLigrettoHighlighted: true,
    description: {
      kind: 'ligretto',
      isPlaygroundAnchored: true,
      text: 'Карты из колоды ligretto нужно выкладывать на свободное место в ряду. Раунд закончится, как только первый из игроков выложит все карты из колоды ligretto.',
    },
  },
  [OnboardingStep.StackCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isStackDeckHighlighted: true,
    description: { kind: 'stack', isPlaygroundAnchored: true, text: 'Если из ряда выложить нечего, воспользуйся колодой в руке' },
  },
  [OnboardingStep.StackUnavailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isStackDeckHighlighted: true,
    description: {
      kind: 'stack',
      text: 'Выкладывать на стол можно только карту того же цвета следующую по номиналу (или единицу на свободное место). Давай искать подходящую карту в руке дальше',
    },
  },
  [OnboardingStep.StackAvailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isStackOpenDeckSelected: true,
    description: { kind: 'stack', text: 'Скорее выкладывай карту на стол!' },
  },
  [OnboardingStep.RowAvailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isSecondRowCardActive: true,
    description: { kind: 'card', cardIndex: 1, text: 'У тебя есть подходящая карта в ряду' },
  },
  [OnboardingStep.LigrettoAvailableCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards'],
    isLigrettoDisabled: false,
    isLigrettoHighlighted: true,
    description: { kind: 'ligretto', text: 'Освободилось место в ряду. Выкладывай из колоды ligretto' },
  },
  [OnboardingStep.GameStarted]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards', 'opponent'],
    isOverlayHidden: true,
    isSecondRowCardActive: true,
  },
  [OnboardingStep.GameStartedCycledInfo]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'playgroundCards', 'opponent'],
    isOverlayHidden: true,
    description: { kind: 'stack', text: CYCLED_INFO_TEXT },
  },
  [OnboardingStep.OpponentTurn]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    isStackDeckHighlighted: true,
    // The second row slot is free, so the ligretto deck stays playable (optional move)
    isLigrettoDisabled: false,
    description: { kind: 'opponentMove', text: 'Соперник выложил карту на стол. Полистай колоду в руке' },
  },
  [OnboardingStep.OpponentTurnSecondCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    isThirdRowCardActive: true,
    // The second row slot may still be free — the ligretto deck stays playable (optional move)
    isLigrettoDisabled: false,
    description: { kind: 'card', cardIndex: 2, text: 'Соперник выложил зелёную двойку. Выкладывай свою тройку из ряда!' },
  },
  [OnboardingStep.OpponentTurnCycledInfo]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    description: { kind: 'stack', text: CYCLED_INFO_TEXT },
  },
  [OnboardingStep.FinalLigrettoCard]: {
    ...baseStepConfig,
    raisedLayers: ['playerCards', 'opponent'],
    isOverlayHidden: true,
    isLigrettoDisabled: false,
    isLigrettoHighlighted: true,
    description: { kind: 'ligretto', text: 'Освободилось место в ряду. Выкладывай карту из колоды ligretto!' },
  },
  [OnboardingStep.Result]: {
    ...baseStepConfig,
    raisedLayers: ['opponent'],
    isOverlayHidden: true,
    isLigrettoDisabled: false,
    isResultVisible: true,
  },
}
