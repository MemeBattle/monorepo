// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withContentlayer } = require('next-contentlayer')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
    typedRoutes: true,
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
