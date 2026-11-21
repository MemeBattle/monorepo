import { useMemo, useState, type PropsWithChildren } from 'react'
import { LazyMotion, MotionConfig } from 'motion/react'

import { CardAnimationContext } from './CardAnimationContext'

const loadFeatures = () => import('./motionFeatures').then(module => module.default)

interface CardAnimationProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardAnimationProvider = ({ enabled, children }: CardAnimationProviderProps) => {
  const [faceDownNames] = useState(() => new Set<string>())
  const value = useMemo(() => ({ isEnabled: enabled, faceDownNames }), [enabled, faceDownNames])

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <CardAnimationContext value={value}>{children}</CardAnimationContext>
      </MotionConfig>
    </LazyMotion>
  )
}
