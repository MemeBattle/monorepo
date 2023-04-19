import type { ReactNode } from 'react'

export function ChipsRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 flex-wrap">{children}</div>
}
