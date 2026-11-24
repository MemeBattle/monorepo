import { useContext, type PropsWithChildren } from 'react'
import { useMotionValue, type Transition } from 'motion/react'
import * as m from 'motion/react-m'

import { CardAnimationContext } from '../CardAnimationProvider/CardAnimationContext'

const SHARED_TRANSITION = { type: 'tween', duration: 0.14, ease: [0.2, 0.8, 0.2, 1] } satisfies Transition

interface CardViewTransitionProps extends PropsWithChildren {
  /** A card leaving one place and a card entering another under the same name in one commit fly between the two. */
  name: string | undefined
  /** `none` keeps the card out of any shared transition, as React's `<ViewTransition share="none">` does. */
  share?: 'auto' | 'none'
}

/**
 * The shared element part of React's `<ViewTransition>`, done with Motion layout animations: they run on the
 * synchronous updates react-redux makes, which a view transition never starts on.
 */
export const CardViewTransition = ({ name, share = 'auto', children }: CardViewTransitionProps) => {
  const isEnabled = useContext(CardAnimationContext)
  // A motion value, not state: re-rendering mid-flight would make Motion measure the card again and restart the
  // flight. Raised while flying, as the card crosses areas that come later in the DOM.
  const zIndex = useMotionValue(0)

  return (
    <m.div
      layoutId={isEnabled && share !== 'none' ? name : undefined}
      transition={SHARED_TRANSITION}
      onLayoutAnimationStart={() => zIndex.set(10)}
      onLayoutAnimationComplete={() => zIndex.set(0)}
      style={{
        display: 'flex',
        position: 'relative',
        zIndex,
        // Through `style`, so Motion corrects the radius while it scales the card.
        borderRadius: '0.25rem',
      }}
    >
      {children}
    </m.div>
  )
}
