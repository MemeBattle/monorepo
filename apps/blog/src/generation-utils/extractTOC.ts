import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import { visit } from 'unist-util-visit'
import { mapHeadingsToTOC } from './mapHeadingsToTOC'
import type { HeadingsItem, TOCTree } from '../types'

const headingTags = new Set(['h2', 'h3', 'h4', 'h5'])

export async function extractTOC(mdxContent: string): Promise<TOCTree> {
  const headings: HeadingsItem[] = []

  const processor = unified().use(remarkParse).use(remarkRehype).use(rehypeSlug)

  const mdast = processor.parse(mdxContent)
  const hast = await processor.run(mdast)

  visit(hast, 'element', (node: any) => {
    if (!headingTags.has(node.tagName)) {
      return
    }
    const textNode = node.children?.find((c: any) => c.type === 'text')
    headings.push({
      level: Number(node.tagName[1]),
      value: textNode?.value ?? '',
      slug: node.properties?.id ?? '',
    })
  })

  return mapHeadingsToTOC(headings)
}
