import rehypeSlug from 'rehype-slug'
import { addTOCRehypePlugin } from './src/generation-utils/addTOCRehypePlugin'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import { defineDocumentType, makeSource, defineNestedType } from 'contentlayer/source-files'
import { mapHeadingsToTOC } from './src/generation-utils/mapHeadingsToTOC'

const Heading = defineNestedType(() => ({
  name: 'Heading',
  fields: {
    level: { type: 'number', required: true },
    value: { type: 'string', required: true },
    slug: { type: 'string', required: true },
    children: { type: 'nested', of: Heading },
  },
}))

/**
 * @param {string} fileName
 * @return {string} language
 */
const extractFileLanguage = fileName => {
  const fileNameParts = fileName.split('.')

  return fileNameParts.length > 2 ? fileNameParts[1] : 'en'
}

/**
 * @param {string} flattenedPath
 * @return {string} language
 */
const extractSlug = flattenedPath => {
  const pathSegments = flattenedPath.split('/')
  const lastSegment = pathSegments.at(-1)

  return lastSegment.split('.')[0]
}

/** @type {import('contentlayer/source-files').ComputedFields} */
const computedFields = {
  slug: {
    type: 'string',
    resolve: doc => extractSlug(doc._raw.flattenedPath),
  },
  toc: { type: '[]', of: Heading, resolve: doc => mapHeadingsToTOC(doc._raw.headings) },
  lang: {
    type: "'en' | 'ru'",
    options: ['en', 'ru'],
    required: true,
    resolve: doc => extractFileLanguage(doc._raw.sourceFileName),
  },
}

export const BlogPost = defineDocumentType(() => ({
  name: 'BlogPost',
  filePathPattern: 'posts/**/*.mdx',
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
      required: true,
    },
    imageDescription: {
      type: 'string',
    },
    author: {
      type: 'string',
      required: true,
    },
  },
  computedFields,
}))

export const Memeber = defineDocumentType(() => ({
  name: 'Memeber',
  filePathPattern: 'memebers/**/*.mdx',
  contentType: 'mdx',
  fields: {
    username: {
      type: 'string',
      required: true,
    },
    fullName: {
      type: 'string',
    },
    avatarFileName: {
      type: 'string',
      required: true,
    },
    title: {
      type: 'string',
    },
  },
}))

export default makeSource({
  contentDirPath: 'content',
  documentTypes: [BlogPost, Memeber],

  mdx: {
    remarkPlugins: [],
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'wrap',
          properties: {
            className: ['no-underline hover:underline font-bold text-inherit'],
          },
        },
      ],
      addTOCRehypePlugin,
    ],
  },
})
