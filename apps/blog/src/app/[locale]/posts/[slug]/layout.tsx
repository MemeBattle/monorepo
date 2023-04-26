import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import type { BlogPost } from 'contentlayer/generated'
import { allBlogPosts } from 'contentlayer/generated'
import type { Language } from '../../../../i18n/i18n.settings'

export async function generateMetadata({ params }: { params: { locale: Language; slug: string } }): Promise<Metadata> {
  const post = allBlogPosts.find((post: BlogPost) => post.slug === params.slug)

  return {
    title: post?.title,
  }
}

export default function PostLayout({ children }: { children: ReactNode }) {
  return children
}
