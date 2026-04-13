import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import type { BlogPost, BlogPostWithTranslates } from './types'
import type { Language } from '@/i18n/i18n.settings'
import { extractTOC } from '@/generation-utils/extractTOC'

const POSTS_DIR = path.join(process.cwd(), 'content/posts')

function extractSlug(filename: string): string {
  return filename.split('.')[0]
}

function extractLang(filename: string): Language {
  const parts = filename.split('.')
  return parts.length > 2 ? (parts[1] as Language) : 'en'
}

function stripMdxExports(content: string): string {
  return content.replace(/^export\s+const\s+\w+\s*=\s*\{[\s\S]*?^\}\s*$/gm, '').trim()
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  'use cache'
  const filenames = readdirSync(POSTS_DIR).filter(f => f.endsWith('.mdx'))

  return Promise.all(
    filenames.map(async filename => {
      const slug = extractSlug(filename)
      const lang = extractLang(filename)

      const fullPath = path.join(POSTS_DIR, filename)
      const fileContent = readFileSync(fullPath, 'utf8')
      const rawBody = stripMdxExports(fileContent)

      const { metadata } = await import(`../../content/posts/${filename}`)

      const toc = await extractTOC(rawBody)

      return {
        title: metadata.title,
        publishedAt: metadata.publishedAt,
        summary: metadata.summary,
        tags: metadata.tags,
        image: metadata.image,
        imageDescription: metadata.imageDescription,
        author: metadata.author,
        slug,
        lang,
        toc,
        rawBody,
        fileName: filename,
      } satisfies BlogPost
    }),
  )
}

export async function getAllBlogPostsWithTranslates(): Promise<BlogPostWithTranslates[]> {
  const allPosts = await getAllBlogPosts()
  return allPosts.map(post => ({
    ...post,
    translates: allPosts.filter(p => p.slug === post.slug).reduce((acc, p) => ({ ...acc, [p.lang]: p }), {} as { [key in Language]?: BlogPost }),
  }))
}

export async function getUniqTags(): Promise<string[]> {
  const allPosts = await getAllBlogPosts()
  return [
    ...allPosts.reduce<Set<string>>((acc, { tags = [] }) => {
      tags.forEach(tag => acc.add(tag))
      return acc
    }, new Set<string>()),
  ]
}
