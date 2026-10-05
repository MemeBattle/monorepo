import type { ReactNode } from 'react'

import { Logo } from '#shared/ui'

interface DashboardHeaderProps {
  /** The account type over the name. */
  label: string
  name: string
  /** Drawn at the end of the row: "Выйти" for a full account, nothing for a guest. */
  action?: ReactNode
}

/** The dashboard's top row: the logo, the account type and the name, and an optional action. */
export const DashboardHeader = ({ label, name, action }: DashboardHeaderProps) => (
  <header className="flex items-center justify-between gap-4">
    <div className="flex min-w-0 items-center gap-3">
      <Logo size={44} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">{label}</span>
        <h1 className="truncate text-[22px] leading-[1.1] font-extrabold">{name}</h1>
      </div>
    </div>
    {action}
  </header>
)
