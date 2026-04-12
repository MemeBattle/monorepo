import type { Language } from '@/i18n/i18n.settings'
import type { TOCTree } from '../types'

export interface BlogPost {
  title: string
  publishedAt: string
  summary: string
  tags?: string[]
  image: string
  imageDescription?: string
  author: string
  slug: string
  lang: Language
  toc: TOCTree
  /** MDX body text with frontmatter stripped */
  rawBody: string
  /** Filename without extension for dynamic import, e.g. "what-is-memebattle.en" */
  fileName: string
}

export interface Member {
  username: string
  fullName?: string
  avatarFileName: string
  title?: string
}

export type BlogPostWithTranslates = BlogPost & { translates: { [key in Language]?: BlogPost } }
