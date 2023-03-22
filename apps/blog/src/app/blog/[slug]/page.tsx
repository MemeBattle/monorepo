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
      <h1>{post.title}</h1>
      <div>
        <div>{post.publishedAt}</div>
      </div>
      <Mdx code={post.body.code} />
    </section>
  )
}
