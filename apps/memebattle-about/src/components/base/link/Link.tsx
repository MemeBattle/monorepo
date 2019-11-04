import React from 'react'
import NextLink, { LinkProps } from 'next/link'

export interface LinkP extends LinkProps {
  is?: string
  className?: string
}

const Element = ({ is = 'a', ...rest }) => React.createElement(is, rest)

export const Link: React.FC<LinkP> = ({ children, href, as, ...rest }) => (
  <NextLink href={href} as={as}>
    <Element {...rest}>{children}</Element>
  </NextLink>
)
