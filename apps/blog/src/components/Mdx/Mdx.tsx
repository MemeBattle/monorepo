import type { ImageProps } from 'next/image'
import Image from 'next/image'
import { useMDXComponent, getMDXComponent } from 'next-contentlayer/hooks'
import InstagramPost from '../InstagramPost'
import { ExternalLink } from '../ExternalLink'
import { Blockquote } from '../Blockquote'

interface MdxProps {
  code: string
}

const components = { Image: (props: ImageProps) => <Image {...props} />, InstagramPost, a: ExternalLink, blockquote: Blockquote }

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)

  return (
    <article className="prose lg:prose-xl">
      <Component components={components} />
    </article>
  )
}

/**************************************
Временно ввел новую функцию ServerMdx, чтобы убрать ошибку:

TypeError: Cannot read properties of null (reading 'useMemo')

Решение взял отсюда https://github.com/vercel/next.js/issues/49267#issuecomment-1535932088

**************************************/

export function ServerMdx({ code }: MdxProps) {
  const Component = getMDXComponent(code)

  return (
    <article className="prose lg:prose-xl">
      <Component components={components} />
    </article>
  )
}
