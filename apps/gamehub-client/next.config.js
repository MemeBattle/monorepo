/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@memebattle/ui'],
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
