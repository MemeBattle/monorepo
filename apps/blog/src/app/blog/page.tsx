import Link from 'next/link'
import type { Blog } from 'contentlayer/generated'
import { allBlogs } from 'contentlayer/generated'

export async function generateStaticParams() {
  return allBlogs.map((post: Blog) => ({
    slug: post.slug,
  }))
}

export default function BlogPage() {
  return (
    <section>
      <h1 className="font-bold text-3xl font-serif mb-5">Blog</h1>
      {allBlogs
        .sort((a: Blog, b: Blog) => {
          if (new Date(a.publishedAt) > new Date(b.publishedAt)) {
            return -1
          }
          return 1
        })
        .map((post: Blog) => (
          <Link key={post.slug} className="flex flex-col space-y-1 mb-4" href={`blog/${post.slug}`}>
            <div className="w-full flex flex-col">
              <p>{post.title}</p>
            </div>
          </Link>
        ))}
    </section>
  )
}
