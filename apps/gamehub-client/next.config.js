/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@memebattle/ui'],
  output: 'standalone',
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
