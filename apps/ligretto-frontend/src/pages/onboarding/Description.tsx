import { Box, Typography } from '@memebattle/ui'
import { useSelector } from 'react-redux'

import { OnboardingStep, onboardingStepSelector } from '#features/onboarding'

import { useOnboardingTargetRef } from './targets'

const STEP_DESCRIPTION: Record<OnboardingStep, string> = {
  [OnboardingStep.Opponents]: 'Это твои соперники',
  [OnboardingStep.Playground]: 'Это общий стол. Сюда будем выкладывать карты',
  [OnboardingStep.Cards]: 'Это твои карты в руке',
  [OnboardingStep.Stack]: 'Другие карты ты можешь искать в этой колоде',
  [OnboardingStep.Row]: 'Это карты в ряду. Их можно выкладывать на стол',
  [OnboardingStep.Ligretto]: 'Это колода лигретто. Твоя цель — выложить все карты из неё',
  [OnboardingStep.FirstCard]: 'Давай выложим первую карту',
  [OnboardingStep.LigrettoCard]: 'Открой карту из колоды лигретто',
  [OnboardingStep.StackCard]: 'Открой следующую карту из стека',
  [OnboardingStep.StackUnavailableCard]: 'Эту карту сейчас выложить некуда. Листай дальше',
  [OnboardingStep.StackAvailableCard]: 'Скорее выкладывай эту карту на стол!',
  [OnboardingStep.RowAvailableCard]: 'У тебя в ряду есть следующая карта — выложи её',
  [OnboardingStep.LigrettoAvailableCard]: 'Освободилось место в ряду — добери карту из лигретто',
  [OnboardingStep.GameStarted]: 'Выкладывать можно только следующую по номиналу карту того же цвета',
  [OnboardingStep.GameStartedCycledInfo]: 'Карты в стеке закончились — они перелистаются заново',
  [OnboardingStep.OpponentTurn]: 'Соперник уже выложил карту. Продолжай игру!',
  [OnboardingStep.OpponentTurnCycledInfo]: 'Карты в стеке закончились — они перелистаются заново',
  [OnboardingStep.Result]: 'Поздравляем! Ты победил!',
}

export function Description() {
  const step = useSelector(onboardingStepSelector)
  const ref = useOnboardingTargetRef('description')
  const text = STEP_DESCRIPTION[step]

  if (!text) {
    return null
  }

  return (
    <Box
      ref={ref as React.RefObject<HTMLDivElement>}
      sx={{ transform: 'translate(-50%, -50%)', position: 'absolute', left: '50%', top: '50%', maxWidth: '32rem', px: 2, zIndex: 2 }}
    >
      <Typography textAlign="center" variant="body1" fontWeight="bold">
        {text}
      </Typography>
    </Box>
  )
}
