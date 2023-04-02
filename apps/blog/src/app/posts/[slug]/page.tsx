import { notFound } from 'next/navigation'
import { Mdx } from '../../../components/Mdx'
import type { Blog } from 'contentlayer/generated'
import { allBlogs } from 'contentlayer/generated'
import { Chip } from '../../../components/Chip'

interface BlogProps {
  params: {
    slug: string
  }
}

export async function generateStaticParams() {
  return allBlogs.map((post: Blog) => ({
    slug: post.slug,
  }))
}

export default function Post({ params }: BlogProps) {
  const post = allBlogs.find((post: Blog) => post.slug === params.slug)

  if (!post) {
    notFound()
  }

  return (
    <article className="p-6 max-w-5xl">
      <p className="text-gray-600 text-sm">{new Date(post.publishedAt).toLocaleDateString()}</p>
      <h1 className="font-bold text-3xl my-6 lg:text-5xl lg:font-extrabold">{post.title}</h1>
      {post.tags ? (
        <div className="flex gap-2 my-6 flex-wrap">
          {post.tags.map(tag => (
            <Chip>{tag}</Chip>
          ))}
        </div>
      ) : null}
      <Mdx code={post.body.code} />
    </article>
  )
}
