import type { NextConfig } from 'next'
import path from 'path'
import createMDX from '@next/mdx'

const withMDX = createMDX({
  options: {
    rehypePlugins: [
      'rehype-slug',
      [
        'rehype-autolink-headings',
        {
          behavior: 'wrap',
          properties: {
            className: ['not-prose no-underline hover:underline font-bold text-inherit'],
          },
        },
      ],
    ],
  },
})

const nextConfig = {
  cacheComponents: false,
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
