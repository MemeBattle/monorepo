import * as React from 'react'


const defaultProps = {
    tag: 'div'
}

type DefaultProps = typeof defaultProps

type Props  = {
  tag: 'div' | 'span' | 'header' | 'main' | 'footer' | 'section',
  className?: string,
  children?: React.ReactNode,
} & Partial<DefaultProps>


export const Box = ({
  tag,
  children,
  ...restProps
}: Props) => {
  return React.createElement(
    tag,
    restProps,
    children
  )
}

