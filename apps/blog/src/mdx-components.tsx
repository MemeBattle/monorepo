import type { MDXComponents } from 'mdx/types'
import type { ImageProps } from 'next/image'
import Image from 'next/image'
import InstagramPost from '@/components/InstagramPost'
import { ExternalLink } from '@/components/ExternalLink'
import { Blockquote } from '@/components/Blockquote'
import { Summary } from '@/components/Summary'
import { Details } from '@/components/Details'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    Image: (props: ImageProps) => <Image {...props} />,
    InstagramPost,
    a: ExternalLink,
    blockquote: Blockquote,
    Details,
    Summary,
    ...components,
  }
}
