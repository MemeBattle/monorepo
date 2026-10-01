import type { ComponentProps, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

type Variant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant
  /** Drawn before the label, on the 24px grid. */
  icon?: ReactNode
  /** Replaces the label while `pending`; the spinner shows either way. */
  pendingLabel?: string
  pending?: boolean
}

/** Primary and danger are the tall 56px controls; secondary is the 44px inline one. */
const variants: Record<Variant, string> = {
  primary: 'min-h-14 bg-accent text-[17px] text-ink shadow-[0_4px_0_var(--color-accent-shadow)]',
  danger: 'min-h-14 bg-danger text-[17px] text-white shadow-[0_4px_0_var(--color-danger-shadow)]',
  secondary: 'min-h-11 border-2 border-line bg-surface text-[15px] text-ink',
}

const looks = {
  pending: 'min-h-14 bg-accent-tint text-[17px] text-ink-muted',
  disabled: 'min-h-14 bg-line-soft text-[17px] text-ink-hint',
}

const base =
  'flex items-center justify-center gap-2.5 rounded-button px-5 py-2 text-center leading-tight font-extrabold transition outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink enabled:active:translate-y-0.5 enabled:active:shadow-none disabled:cursor-default'

export const Button = ({
  variant = 'primary',
  icon,
  pendingLabel,
  pending = false,
  disabled = false,
  children,
  className = '',
  ...rest
}: ButtonProps) => {
  const look = pending ? looks.pending : disabled ? looks.disabled : variants[variant]
  return (
    <button type="button" disabled={disabled || pending} className={`${base} ${look} ${className}`} {...rest}>
      {pending ? <Spinner /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}

/** A submit button that follows the enclosing form's pending state. */
export const SubmitButton = (props: Omit<ButtonProps, 'pending' | 'type'>) => {
  const { pending } = useFormStatus()
  return <Button type="submit" pending={pending} {...props} />
}

/** The 18px ring a control shows while it waits; it takes the place of the control's icon. */
export const Spinner = () => (
  <span className="inline-block size-[18px] animate-spin rounded-full border-[3px] border-line border-t-ink" aria-hidden="true" />
)
