import type { ImageProps } from 'next/image'
import NextImage from 'next/image'
import { useMDXComponent } from 'next-contentlayer/hooks'
import InstagramPost from '../InstagramPost'

interface MdxProps {
  code: string
}

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)

  return (
    <article className="prose lg:prose-xl">
      <Component components={{ Image: (props: ImageProps) => <NextImage {...props} />, InstagramPost }} />
    </article>
  )
}
