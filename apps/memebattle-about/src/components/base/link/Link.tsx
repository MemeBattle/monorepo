import React from 'react'
import NextLink, { LinkProps } from 'next/link'

export interface LinkP extends LinkProps {
  children: React.ReactElement
  is?: string
}

const Element = ({ is = 'a', ...rest }) => React.createElement(is, rest)

export const Link: React.FC<LinkP> = ({ children, href, as, ...rest }) => (
  <NextLink href={href} as={as}>
    <Element {...rest}>{children}</Element>
  </NextLink>
)
