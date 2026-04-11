import path from 'path'
import { fileURLToPath } from 'url'
import { mergeConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import svgr from 'vite-plugin-svgr'
import type { StorybookConfig } from '@storybook/react-vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const config: StorybookConfig = {
  stories: ['../apps/**/*.stories.tsx', '../packages/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen',
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      define: { 'process.env': {} },
      plugins: [tsconfigPaths(), svgr()],
      resolve: {
        alias: {
          '@memebattle/ui': path.resolve(root, 'packages/ui/src/index.ts'),
          '@memebattle/ligretto-shared': path.resolve(root, 'packages/ligretto-shared/src/index.ts'),
        },
      },
    })
  },
}

export default config
