declare module '*.png'
declare module '*.jpg'
declare module '*.gif'
declare module '*.svg' {
  import type * as React from 'react'

  const path: string

  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>
  export default path
}
