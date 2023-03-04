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
      <h1>Blog</h1>
      {allBlogs
        .sort((a: Blog, b: Blog) => {
          if (new Date(a.publishedAt) > new Date(b.publishedAt)) {
            return -1
          }
          return 1
        })
        .map((post: Blog) => (
          <Link key={post.slug} href={`blog/${post.slug}`}>
            <div>
              <p>{post.title}</p>
            </div>
          </Link>
        ))}
    </section>
  )
}
