// @ts-check

import { defineDocumentType, makeSource, defineNestedType } from 'contentlayer/source-files'

const Heading = defineNestedType(() => ({
  name: 'Heading',
  fields: {
    level: { type: 'enum', options: ['h1', 'h2', 'h3', 'h4', 'h5'], required: true },
    text: { type: 'string' },
  },
}))

/**
 *
 * @param {string} fileName
 * @return {string} language
 */
const extractFileLanguage = fileName => {
  const fileNameParts = fileName.split('.')

  return fileNameParts.length > 2 ? fileNameParts[1] : 'en'
}

/** @type {import('contentlayer/source-files').ComputedFields} */
const computedFields = {
  slug: {
    type: 'string',
    resolve: doc => doc._raw.flattenedPath,
  },
  toc: {
    type: 'list',
    of: Heading,
    resolve: () => [{ level: 'h1', text: 'text' }],
  },
  lang: {
    type: 'string',
    required: true,
    resolve: doc => extractFileLanguage(doc._raw.sourceFileName),
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
