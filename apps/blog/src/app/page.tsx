import Link from 'next/link'

export default function BlogPage() {
  return (
    <section>
      <h1 className="font-bold text-3xl font-serif mb-5">Blog</h1>
      <Link className="flex flex-col space-y-1 mb-4" href="/blog">
        Posts
      </Link>
    </section>
  )
}
