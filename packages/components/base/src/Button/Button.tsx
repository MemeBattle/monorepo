import * as React from 'react'

interface Props {
  type: 'submit' | 'button' | 'reset',
  className: string,
  children: React.ReactNode,
  onClick: () => any,
}

export const Button = ({
  type,
  className,
  children,
  onClick,
}: Props) => {
  return (
    <button
      onClick={onClick}
      className={className}
      type={type}
    >
      {children}
    </button>
  )
}

Button.defaultProps = {
  type: 'button'
}
