import type { ReactNode, MouseEvent } from 'react'

interface ChipProps<C extends ReactNode> {
  children: C
  isActive?: boolean
  onClick?: (e: MouseEvent<HTMLDivElement>, value: C) => void
}

export function Chip<C extends ReactNode>({ children, isActive, onClick }: ChipProps<C>) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick ? e => onClick(e, children) : undefined}
      aria-checked={isActive}
      className="inline-flex rounded-2xl border aria-checked:border-memebattleYellow aria-checked:bg-memebattleYellow py-0.5 font-thin px-4 text-sm"
    >
      {children}
    </div>
  )
}
