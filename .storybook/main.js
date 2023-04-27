const { mergeConfig } = require("vite")
const { default: tsconfigPaths } = require('vite-tsconfig-paths')
const { default: svgr } = require('vite-plugin-svgr')

module.exports = {
  stories: ['../apps/**/*.stories.tsx', '../packages/**/*.stories.tsx'],
  addons: ['@storybook/preset-scss', '@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen', // 👈 react-docgen configured here.
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      define: { 'process.env': {} },
      plugins: [
        tsconfigPaths(),
        svgr(),
      ]
    })
  },
}
