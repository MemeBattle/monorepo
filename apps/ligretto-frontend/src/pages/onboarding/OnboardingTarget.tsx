import type { PropsWithChildren } from 'react'

import { useOnboardingTargetRef, type OnboardingTargetId } from './targets'

interface OnboardingTargetProps {
  id: OnboardingTargetId
}

export function OnboardingTarget({ id, children }: PropsWithChildren<OnboardingTargetProps>) {
  const ref = useOnboardingTargetRef(id)

  return <div ref={ref as React.RefObject<HTMLDivElement>}>{children}</div>
}
