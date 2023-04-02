import Link from 'next/link'

export default function BlogPage() {
  return (
    <section>
      <h1>Blog</h1>
      <Link href="/posts">Posts</Link>
    </section>
  )
}
