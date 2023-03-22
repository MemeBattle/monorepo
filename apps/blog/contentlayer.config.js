import { defineDocumentType, makeSource } from 'contentlayer/source-files'
// import remarkGfm from 'remark-gfm'
// import rehypePrettyCode from 'rehype-pretty-code'
// import rehypeSlug from 'rehype-slug'
// import rehypeAutolinkHeadings from 'rehype-autolink-headings'

/** @type {import('contentlayer/source-files').ComputedFields} */
const computedFields = {
  slug: {
    type: 'string',
    resolve: doc => doc._raw.flattenedPath,
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
      type: 'string',
      required: true,
    },
    summary: {
      type: 'string',
      required: true,
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
