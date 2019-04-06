import React from 'react'

export interface Props {
  onClick?: () => any
  type: 'submit' | 'button' | 'reset'
  className: string
  children: React.ReactNode
}

export const Button: React.FC<Props> = ({ type, className, children, onClick }) => {
  return (
    <button onClick={onClick} className={className} type={type}>
      {children}
    </button>
  )
}

Button.defaultProps = {
  type: 'button',
  onClick: () => undefined,
}
