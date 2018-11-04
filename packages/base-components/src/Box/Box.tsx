import React from 'react'

interface Props {
  tag: 'div' | 'span' | 'header' | 'main' | 'footer' | 'section',
  className?: string,
  children?: React.ReactNode,
}

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

Box.defaultProps = {
  tag: 'div'
}
