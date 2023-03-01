import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { ConsCard } from '../ConsCard'
import { ProsCard } from '../ProsCard'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
const CustomLink = props => {
  const href = props.href

  if (href.startsWith('/')) {
    return (
      <Link href={href} {...props}>
        {props.children}
      </Link>
    )
  }

  if (href.startsWith('#')) {
    return <a {...props} />
  }

  return <a target="_blank" rel="noopener noreferrer" {...props} />
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
function RoundedImage(props) {
  return <Image alt={props.alt} className="rounded-lg" {...props} />
}

const components = {
  Image: RoundedImage,
  a: CustomLink,
  ProsCard,
  ConsCard,
}

interface MdxProps {
  code: string
}

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)

  return (
    <article className="prose prose-quoteless prose-neutral dark:prose-invert">
      <Component components={{ ...components }} />
    </article>
  )
}
