import * as React from 'react'

const defaultProps = {
  tag: 'div',
}

type DefaultProps = typeof defaultProps

type Props = {
  is: 'div' | 'span' | 'header' | 'main' | 'footer' | 'section'
  className?: string
  children?: React.ReactNode
} & Partial<DefaultProps>

export const Box = ({ is, children, ...restProps }: Props) => {
  return React.createElement(is, restProps, children)
}
