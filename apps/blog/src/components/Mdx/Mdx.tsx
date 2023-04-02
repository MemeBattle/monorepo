import { useMDXComponent } from 'next-contentlayer/hooks'

interface MdxProps {
  code: string
}

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)

  return (
    <article className="prose lg:prose-xl">
      <Component />
    </article>
  )
}
