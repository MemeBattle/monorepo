import type { ReactNode } from 'react'
import { Icon } from './icons'

interface AlertProps {
  title: string
  /** The explanation; may carry a link (an inline `<a>` inherits the colour). */
  children: ReactNode
}

/** An error that stays on the screen that produced it, above the form. */
export const Alert = ({ title, children }: AlertProps) => (
  <div role="alert" className="flex gap-3 rounded-field border-2 border-danger-line bg-danger-tint px-4 py-3.5 text-danger">
    <Icon name="alert" size={22} />
    <div className="flex flex-col gap-1">
      <span className="text-[15px] leading-tight font-extrabold">{title}</span>
      <span className="text-sm leading-snug font-medium text-danger-ink">{children}</span>
    </div>
  </div>
)
