import type { NextConfig } from 'next'
import path from 'path'
import createMDX from '@next/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'

const withMDX = createMDX({
  options: {
    // remarkPlugins: [remarkFrontmatter],
    // rehypePlugins: [
    //   'rehypeSlug',
    //   [
    //     rehypeAutolinkHeadings,
    //     {
    //       behavior: 'wrap',
    //       properties: {
    //         className: ['no-underline hover:underline font-bold text-inherit'],
    //       },
    //     },
    //   ],
    // ],
  },
})

const nextConfig = {
  experimental: { mdxRs: true },
  reactStrictMode: true,
  output: 'standalone',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  async rewrites() {
    return [
      {
        source: '/amplitude',
        destination: 'https://api2.amplitude.com/2/httpapi',
      },
    ]
  },
} satisfies NextConfig

export default withMDX(nextConfig)
