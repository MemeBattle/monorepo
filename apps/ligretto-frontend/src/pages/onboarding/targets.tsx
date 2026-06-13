import { createContext, useContext, useMemo, useRef, type PropsWithChildren, type RefObject } from 'react'

interface TargetsContextValue {
  containerRef: RefObject<HTMLElement | null>
}

const OnboardingTargetsContext = createContext<TargetsContextValue | null>(null)

export function OnboardingTargetsProvider({ children }: PropsWithChildren) {
  const containerRef = useRef<HTMLElement | null>(null)
  const value = useMemo<TargetsContextValue>(() => ({ containerRef }), [])
  return <OnboardingTargetsContext.Provider value={value}>{children}</OnboardingTargetsContext.Provider>
}

export function useOnboardingContainerRef(): RefObject<HTMLElement | null> {
  const context = useContext(OnboardingTargetsContext)
  const fallback = useRef<HTMLElement | null>(null)
  return context ? context.containerRef : fallback
}
