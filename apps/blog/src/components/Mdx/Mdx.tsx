import type { ImageProps } from 'next/image'
import Image from 'next/image'
import { useMDXComponent, getMDXComponent } from 'next-contentlayer/hooks'
import InstagramPost from '../InstagramPost'
import { ExternalLink } from '../ExternalLink'
import { Blockquote } from '../Blockquote'
import { Summary } from '../Summary'
import { Details } from '../Details'
import { generateFullUrl } from '../../utils/generateFullUrl'

interface MdxProps {
  code: string
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
    const updatedProps = { ...props, src: generateFullUrl(props.src) }

    return <img {...updatedProps} />
  },
  InstagramPost: () => null, // TODO: https://github.com/MemeBattle/monorepo/issues/438 create InstagramPost fallback component
}

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)

  return (
    <article className="prose lg:prose-xl">
      <Component components={components} />
    </article>
  )
}

/**************************************
useMDXComponent hook doesn't work on a server side.  It throws TypeError:
    TypeError: Cannot read properties of null (reading 'useMemo')

See https://github.com/vercel/next.js/issues/49267#issuecomment-1535932088

**************************************/

export function ServerMdx({ code }: MdxProps) {
  const Component = getMDXComponent(code)

  return <Component components={rssComponents} />
}
