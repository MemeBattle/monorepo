import { useContext, useLayoutEffect, useState, type PropsWithChildren } from 'react'
import { useMotionValue, type Transition } from 'motion/react'
import * as m from 'motion/react-m'
import { CardBackFace } from '../Card/CardBackFace'

import { CardAnimationContext } from '../CardAnimationProvider/CardAnimationContext'

const SHARED_TRANSITION = { type: 'tween', duration: 0.14, ease: [0.2, 0.8, 0.2, 1] } satisfies Transition
// Symmetric, so the card is edge-on mid-flight: an ease-out would show the back only while the card still covers the
// deck it leaves.
const FLIP_TRANSITION = { type: 'tween', duration: 0.2, ease: 'easeInOut' } satisfies Transition

interface CardTurnProps extends PropsWithChildren {
  to: 'up' | 'down'
  onTurned?: () => void
}

/** The face (`children`) and the card back, back to back, turning from one to the other. */
const CardTurn = ({ to, onTurned, children }: CardTurnProps) => (
  <m.div
    initial={{ rotateY: to === 'up' ? 180 : 0 }}
    animate={{ rotateY: to === 'up' ? 0 : 180 }}
    transition={FLIP_TRANSITION}
    onAnimationComplete={onTurned}
    style={{ display: 'flex', position: 'relative', transformStyle: 'preserve-3d', transformPerspective: 600 }}
  >
    <div style={{ display: 'flex', backfaceVisibility: 'hidden' }}>{children}</div>
    <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
      <CardBackFace />
    </div>
  </m.div>
)

interface CardViewTransitionProps extends PropsWithChildren {
  /** A card leaving one place and a card entering another under the same name in one commit fly between the two. */
  name: string | undefined
  /** `none` keeps the card out of any shared transition, as React's `<ViewTransition share="none">` does. */
  share?: 'auto' | 'none'
  /** The card lies face down here: when it next appears face up, it turns over on the way. */
  isFaceDown?: boolean
  /** The card arrives face up and turns face down on the way here; `children` is its face. */
  isTurningDown?: boolean
  /** Called once the card has turned face down. */
  onTurnedDown?: () => void
}

/**
 * The shared element part of React's `<ViewTransition>`, done with Motion layout animations: they run on the
 * synchronous updates react-redux makes, which a view transition never starts on.
 */
export const CardViewTransition = ({
  name,
  share = 'auto',
  isFaceDown = false,
  isTurningDown = false,
  onTurnedDown,
  children,
}: CardViewTransitionProps) => {
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
      transition={isTurningUp || isTurningDown ? FLIP_TRANSITION : SHARED_TRANSITION}
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
        <CardTurn to="up">{children}</CardTurn>
      ) : isTurningDown ? (
        <CardTurn to="down" onTurned={onTurnedDown}>
          {children}
        </CardTurn>
      ) : (
        children
      )}
    </m.div>
  )
}
