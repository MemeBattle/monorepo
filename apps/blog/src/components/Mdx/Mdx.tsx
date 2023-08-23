import Image from 'next/image'
import { useMDXComponent } from 'next-contentlayer/hooks'
import InstagramPost from '../InstagramPost'

const Link = ({ href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  let linkClass: string | undefined
  if (href?.startsWith('http')) {
    linkClass = 'text-externalLink font-semibold no-underline after:content-externalLink after:ml-4'
  }
  return <a className={linkClass} {...rest} href={href} />
}

interface MdxProps {
  code: string
}

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)

  return (
    <article className="prose lg:prose-xl">
      <Component components={{ Image, InstagramPost, a: Link }} />
    </article>
  )
}
