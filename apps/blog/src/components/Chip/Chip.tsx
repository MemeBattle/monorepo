import type { ReactNode } from 'react'

export function Chip({ children }: { children: ReactNode }) {
  return <div className="inline-flex rounded-2xl bg-memebattleYellow py-0.5 font-thin px-4 text-sm">{children}</div>
}
