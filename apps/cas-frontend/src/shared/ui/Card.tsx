import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  /** `surface` is the plain panel; `accent` is the nudge card on the dashboard. */
  tone?: 'surface' | 'accent'
  className?: string
}

const tones = {
  surface: 'border-line bg-surface',
  accent: 'border-accent bg-accent-tint',
}

/** A rounded, bordered panel; the sections and the nudge card are made of it. */
export const Card = ({ children, tone = 'surface', className = '' }: CardProps) => (
  <div className={`flex flex-col overflow-hidden rounded-card border-2 ${tones[tone]} ${className}`}>{children}</div>
)

interface SectionProps {
  title: string
  /** An inline control in the title row, "Добавить" on the passkeys section. */
  action?: ReactNode
  children: ReactNode
}

/** A titled card on the dashboard; the rows inside separate themselves. */
export const Section = ({ title, action, children }: SectionProps) => (
  <section className="flex flex-col gap-2.5">
    <div className="flex min-h-6 items-center justify-between">
      <h2 className="text-[13px] font-extrabold tracking-[0.1em] text-ink-muted uppercase">{title}</h2>
      {action}
    </div>
    <Card className="divide-y-2 divide-line-soft">{children}</Card>
  </section>
)
