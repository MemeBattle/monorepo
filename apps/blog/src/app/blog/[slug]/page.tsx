import { notFound } from 'next/navigation'
import { Mdx } from '../../../components/Mdx'
import type { Blog } from 'contentlayer/generated'
import { allBlogs } from 'contentlayer/generated'

interface BlogProps {
  params: {
    slug: string
  }
}

export default function Blog({ params }: BlogProps) {
  const post = allBlogs.find((post: Blog) => post.slug === params.slug)

  if (!post) {
    notFound()
  }

  return (
    <section>
      <h1 className="font-bold text-3xl font-serif max-w-[650px]">{post.title}</h1>
      <div className="grid grid-cols-[auto_1fr_auto] items-center mt-4 mb-8 font-mono text-sm max-w-[650px]">
        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-md px-2 py-1 tracking-tighter">{post.publishedAt}</div>
        <div className="h-[0.2em] bg-neutral-50 dark:bg-neutral-800 mx-2" />
      </div>
      <Mdx code={post.body.code} />
    </section>
  )
}
