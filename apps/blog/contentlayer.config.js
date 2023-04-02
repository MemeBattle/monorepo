// @ts-check

import { defineDocumentType, makeSource, defineNestedType } from 'contentlayer/source-files'

const Heading = defineNestedType(() => ({
  name: 'Heading',
  fields: {
    level: { type: 'enum', options: ['h1', 'h2', 'h3', 'h4', 'h5'], required: true },
    text: { type: 'string' },
  },
}))

/** @type {import('contentlayer/source-files').ComputedFields} */
const computedFields = {
  slug: {
    type: 'string',
    resolve: doc => doc._raw.flattenedPath,
  },
  toc: {
    type: 'list',
    of: Heading,
    resolve: doc => {
      console.log('doc.body', doc.body)
      return [{ level: 'h1', text: 'text' }]
    },
  },
}

export const Blog = defineDocumentType(() => ({
  name: 'Blog',
  filePathPattern: '**/*.mdx',
  contentType: 'mdx',
  fields: {
    title: {
      type: 'string',
      required: true,
    },
    publishedAt: {
      type: 'date',
      required: true,
    },
    summary: {
      type: 'string',
      required: true,
    },
    tags: {
      type: 'list',
      of: {
        type: 'string',
      },
    },
    image: {
      type: 'string',
    },
  },
  computedFields,
}))

export default makeSource({
  contentDirPath: 'content',
  documentTypes: [Blog],
  // Examples of mdx plugins

  // mdx: {
  //   remarkPlugins: [remarkGfm],
  //   rehypePlugins: [
  //     rehypeSlug,
  //     [
  //       rehypePrettyCode,
  //       {
  //         theme: 'one-dark-pro',
  //         onVisitLine(node) {
  //           // Prevent lines from collapsing in `display: grid` mode, and allow empty
  //           // lines to be copy/pasted
  //           if (node.children.length === 0) {
  //             node.children = [{ type: 'text', value: ' ' }]
  //           }
  //         },
  //         onVisitHighlightedLine(node) {
  //           node.properties.className.push('line--highlighted')
  //         },
  //         onVisitHighlightedWord(node) {
  //           node.properties.className = ['word--highlighted']
  //         },
  //       },
  //     ],
  //     [
  //       rehypeAutolinkHeadings,
  //       {
  //         properties: {
  //           className: ['anchor'],
  //         },
  //       },
  //     ],
  //   ],
  // },
})
