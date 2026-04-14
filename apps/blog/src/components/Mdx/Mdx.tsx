import type { ImageProps } from 'next/image'
import Image from 'next/image'
import InstagramPost from '../InstagramPost'
import { ExternalLink } from '../ExternalLink'
import { Blockquote } from '../Blockquote'
import { Summary } from '../Summary'
import { Details } from '../Details'
import { generateFullUrl } from '../../utils/generateFullUrl'

interface MdxProps {
  filename: string
}

const components = {
  Image: (props: ImageProps) => <Image {...props} />,
  InstagramPost,
  a: ExternalLink,
  blockquote: Blockquote,
  Details,
  Summary,
}

const rssComponents = {
  ...components,
  Image: (props: React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>) => {
    const updatedProps = { ...props, src: generateFullUrl(props.src?.toString()) }

    return <img {...updatedProps} />
  },
  InstagramPost: () => null, // TODO: https://github.com/MemeBattle/monorepo/issues/438 create InstagramPost fallback component
}

export async function Mdx({ filename }: MdxProps) {
  const { default: MdxContent } = await import(`../../../content/posts/${filename}`)

  return (
    <article className="prose lg:prose-xl">
      <MdxContent components={components} />
    </article>
  )
}

/**************************************
 * ServerMdx is used for RSS feed rendering via ReactDOMServer.renderToStaticMarkup.
 * MdxContent is a synchronous React component (compiled by @next/mdx), so
 * renderToStaticMarkup can render it without async support.
 **************************************/

export async function ServerMdx({ filename }: MdxProps) {
  const { default: MdxContent } = await import(`../../../content/posts/${filename}`)

  return <MdxContent components={rssComponents} />
}
