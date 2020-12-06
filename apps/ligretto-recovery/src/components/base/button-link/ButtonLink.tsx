import React from 'react'
import { Link } from 'react-router-dom'
import { Button, ButtonProps } from '@memebattle/ligretto-ui'

export interface ButtonLinkProps extends ButtonProps {
  to: string
}

export const ButtonLink: React.FC<ButtonLinkProps> = ({ to, ...buttonProps }) => (
  <Link to={to}>
    <Button {...buttonProps} />
  </Link>
)
