import * as React from 'react'

interface Props {
  is?: 'div' | 'span' | 'header' | 'main' | 'footer' | 'section' | 'aside'
  className?: string
  children?: React.ReactNode
  style?: React.CSSProperties
}

export const Box = React.forwardRef(({ is = 'div', children, ...restProps }: Props, ref) => {
  return React.createElement(is, { ...restProps, ref }, children)
})
