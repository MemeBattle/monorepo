import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { Icon } from './icons'

interface TextFieldProps extends ComponentProps<'input'> {
  label: string
  /** Drawn inside the field, before the text. */
  icon?: ReactNode
  /** Turns the field red and replaces the helper under it. */
  error?: string | null
  helper?: string
}

export const TextField = ({ label, icon, error, helper, id, className = '', ...rest }: TextFieldProps) => {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = error || helper ? `${inputId}-hint` : undefined
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={inputId} className="text-[13px] font-bold text-ink-muted">
        {label}
      </label>
      <div
        className={`flex h-13 items-center gap-2.5 rounded-field border-2 bg-surface px-4 text-base font-medium focus-within:border-ink ${error ? 'border-danger' : 'border-line'}`}
      >
        {icon}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-hint"
          {...rest}
        />
      </div>
      {error ? (
        <span id={hintId} className="flex items-center gap-1.5 text-[13px] font-bold text-danger">
          <Icon name="alert" size={16} />
          {error}
        </span>
      ) : helper ? (
        <span id={hintId} className="text-[13px] leading-snug font-medium text-ink-muted">
          {helper}
        </span>
      ) : null}
    </div>
  )
}
