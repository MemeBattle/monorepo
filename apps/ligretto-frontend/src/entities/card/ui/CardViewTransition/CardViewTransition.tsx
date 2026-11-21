import { useContext, useLayoutEffect, useState, type PropsWithChildren } from 'react'
import { useMotionValue, type Transition } from 'motion/react'
import * as m from 'motion/react-m'
import { CardBackFace } from '../Card/CardBackFace'

import { CardAnimationContext } from '../CardAnimationProvider/CardAnimationContext'

const SHARED_TRANSITION = { type: 'tween', duration: 0.14, ease: [0.2, 0.8, 0.2, 1] } satisfies Transition
// Long enough for the turn to be seen: at the table flight's 140 ms it reads as a blink. Symmetric, so the card is
// edge-on mid-flight: an ease-out would show the back only while the card still covers the deck it leaves.
const FLIP_TRANSITION = { type: 'tween', duration: 0.4, ease: 'easeInOut' } satisfies Transition

interface CardViewTransitionProps extends PropsWithChildren {
  /** A card leaving one place and a card entering another under the same name in one commit fly between the two. */
  name: string | undefined
  /** `none` keeps the card out of any shared transition, as React's `<ViewTransition share="none">` does. */
  share?: 'auto' | 'none'
  /** The card lies face down here: when it next appears face up, it turns over on the way. */
  isFaceDown?: boolean
}

/**
 * The shared element part of React's `<ViewTransition>`, done with Motion layout animations: they run on the
 * synchronous updates react-redux makes, which a view transition never starts on.
 */
export const CardViewTransition = ({ name, share = 'auto', isFaceDown = false, children }: CardViewTransitionProps) => {
  const { isEnabled, faceDownNames } = useContext(CardAnimationContext)
  const isShared = isEnabled && share !== 'none'
  // Decided once, on mount: the card arrives face down from its last place and turns over on the way here.
  const [isTurningUp] = useState(() => isShared && !isFaceDown && name !== undefined && faceDownNames.has(name))
  // A motion value, not state: re-rendering mid-flight would make Motion measure the card again and restart the
  // flight. Raised while flying, as the card crosses areas that come later in the DOM.
  const zIndex = useMotionValue(0)

  useLayoutEffect(() => {
    if (!isEnabled || name === undefined) {
      return
    }
    if (isFaceDown) {
      faceDownNames.add(name)
    } else {
      faceDownNames.delete(name)
    }
  }, [faceDownNames, isEnabled, isFaceDown, name])

  return (
    <m.div
      layoutId={isShared ? name : undefined}
      transition={isTurningUp ? FLIP_TRANSITION : SHARED_TRANSITION}
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
      {isTurningUp ? (
        <m.div
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={FLIP_TRANSITION}
          style={{ display: 'flex', position: 'relative', transformStyle: 'preserve-3d', transformPerspective: 600 }}
        >
          <div style={{ display: 'flex', backfaceVisibility: 'hidden' }}>{children}</div>
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <CardBackFace />
          </div>
        </m.div>
      ) : (
        children
      )}
    </m.div>
  )
}
