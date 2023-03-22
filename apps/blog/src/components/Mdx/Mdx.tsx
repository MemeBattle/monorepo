import * as React from 'react'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { ConsCard } from '../ConsCard'
import { ProsCard } from '../ProsCard'

const components = {
  ProsCard,
  ConsCard,
}

interface MdxProps {
  code: string
}

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)

  return (
    <article>
      <Component components={{ ...components }} />
    </article>
  )
}
