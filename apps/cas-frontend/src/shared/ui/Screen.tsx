import type { ReactNode } from 'react'
import { Logo } from './Logo'

interface ScreenProps {
  children: ReactNode
  /** `center` for the auth screens, `top` for the dashboard. */
  align?: 'center' | 'top'
}

const columns = {
  center: 'px-7 py-12',
  top: 'px-5 pt-7 pb-8',
}

const contents = {
  center: 'justify-center gap-10',
  top: 'justify-start gap-6',
}

/** One centred column on the brand ground, the same on every screen; the footer sits at the bottom. */
export const Screen = ({ children, align = 'center' }: ScreenProps) => (
  <div className="flex min-h-dvh flex-col items-center bg-ground text-ink">
    <div className={`flex w-full max-w-[420px] flex-1 flex-col gap-10 ${columns[align]}`}>
      <div className={`flex flex-1 flex-col ${contents[align]}`}>{children}</div>
      <Footer />
    </div>
  </div>
)

/** Muted rather than hint: 12px text in the hint colour is 2.4:1 on the ground, under WCAG AA. */
export const Footer = () => <p className="text-center text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">cas.mems.fun</p>

interface HeroProps {
  title: string
  subtitle: string
  logoSize?: number
}

/** Logo, headline and one line under it; the top of the auth screens. */
export const Hero = ({ title, subtitle, logoSize = 112 }: HeroProps) => (
  <div className="flex flex-col items-center gap-5">
    <Logo size={logoSize} />
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-[30px] leading-[1.15] font-extrabold tracking-[-0.01em]">{title}</h1>
      <p className="text-base leading-[1.45] font-medium text-ink-muted">{subtitle}</p>
    </div>
  </div>
)

interface SwitchLinkProps {
  /** "Нет аккаунта?" */
  question: string
  /** The link itself, a react-router `<Link>` on the real screens. */
  children: ReactNode
}

/** The "other path" line under a form: a question and a link. */
export const SwitchLink = ({ question, children }: SwitchLinkProps) => (
  <p className="mt-1.5 text-center text-[15px] font-medium text-ink-muted [&_a]:font-bold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-[3px]">
    {question} {children}
  </p>
)
