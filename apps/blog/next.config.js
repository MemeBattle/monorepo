/* eslint-disable @typescript-eslint/no-var-requires */
const { createContentlayerPlugin } = require('next-contentlayer')
const { resolve } = require('node:path')

const withContentlayer = createContentlayerPlugin({ configPath: resolve(__dirname, './contentlayer.config.js') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    appDir: true,
    typedRoutes: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/amplitude',
        destination: 'https://api2.amplitude.com/2/httpapi',
      },
    ]
  },
}

module.exports = withContentlayer(nextConfig)
