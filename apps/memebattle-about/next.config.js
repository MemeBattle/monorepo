/* eslint-disable */
const withTypescript = require('@zeit/next-typescript')
const sass = require('@zeit/next-sass')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const withPlugins = require('next-compose-plugins')
const path = require('path')
const withImages = require('next-images')
const withCSS = require('@zeit/next-css')

const nextConfig = {
  webpack(config, options) {
    if (options.isServer) {
      config.plugins.push(new ForkTsCheckerWebpackPlugin())
    }
    config.resolve.alias['🏠'] = path.join(__dirname, 'src/')
    if (!options.isServer) {
      for (const entry of options.defaultLoaders.sass) {
        if (entry.loader === 'css-loader') {
          entry.loader = 'typings-for-css-modules-loader'
          break
        }
      }
    }
    return config
  },
}

const withSass = [
  sass,
  {
    cssModules: true,
    cssLoaderOptions: {
      localIdentName: '[local]___[hash:base64:5]',
      camelCase: true,
      namedExport: true,
    },
  },
]

module.exports = withPlugins([withTypescript, withCSS, withSass, withImages], nextConfig)
