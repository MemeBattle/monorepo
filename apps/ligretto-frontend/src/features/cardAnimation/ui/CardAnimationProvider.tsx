import type { PropsWithChildren } from 'react'
import { LazyMotion, MotionConfig } from 'motion/react'

import { CardAnimationContext } from './CardAnimationContext'

const loadFeatures = () => import('./motionFeatures').then(module => module.default)

interface CardAnimationProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardAnimationProvider = ({ enabled, children }: CardAnimationProviderProps) => (
  <LazyMotion features={loadFeatures} strict>
    <MotionConfig reducedMotion="user">
      <CardAnimationContext value={enabled}>{children}</CardAnimationContext>
    </MotionConfig>
  </LazyMotion>
)
