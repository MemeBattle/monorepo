import React from 'react'

export interface Props {
  onClick?: () => any
  type: 'submit' | 'button' | 'reset'
  className: string
  children: React.ReactNode
  disabled?: boolean
}

export const Button: React.FC<Props> = ({
  type = 'button',
  className,
  children,
  onClick,
  disabled = false,
}) => {
  return (
    <button onClick={onClick} className={className} type={type} disabled={disabled}>
      {children}
    </button>
  )
}
