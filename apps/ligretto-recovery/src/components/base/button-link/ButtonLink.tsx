import React from 'react'
import { Link } from 'react-router-dom'
import { Button, ButtonProps } from '../button'

export interface ButtonLinkProps extends ButtonProps {
  to: string
}

export const ButtonLink: React.FC<ButtonLinkProps> = ({ to, ...buttonProps }) => {
  return (
    <Link to={to}>
      <Button {...buttonProps} />
    </Link>
  )
}
