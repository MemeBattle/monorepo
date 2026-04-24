import { createContext, useContext, useMemo, useRef, type PropsWithChildren, type RefObject } from 'react'

export type OnboardingTargetId = 'opponents' | 'playground' | 'playerRow' | 'ligretto' | 'stack' | 'card0' | 'card1' | 'card2' | 'description'

type Targets = Map<OnboardingTargetId, RefObject<HTMLElement | null>>

const OnboardingTargetsContext = createContext<Targets | null>(null)

export function OnboardingTargetsProvider({ children }: PropsWithChildren) {
  const targets = useMemo<Targets>(() => new Map(), [])
  return <OnboardingTargetsContext.Provider value={targets}>{children}</OnboardingTargetsContext.Provider>
}

export function useOnboardingTargetRef(id: OnboardingTargetId): RefObject<HTMLElement | null> {
  const targets = useContext(OnboardingTargetsContext)
  const fallback = useRef<HTMLElement | null>(null)

  if (!targets) {
    return fallback
  }

  let ref = targets.get(id)
  if (!ref) {
    ref = { current: null }
    targets.set(id, ref)
  }
  return ref
}
