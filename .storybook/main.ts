import path from 'path'
import { fileURLToPath } from 'url'
import { mergeConfig } from 'vite'
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
      plugins: [svgr()],
      resolve: {
        // Workspace packages are aliased to sources: their injected dist copies
        // live under node_modules, so vite would serve them without CJS interop
        // and their deps would never be prebundled. The subpath alias must come
        // before the bare package alias.
        alias: {
          '@memebattle/ui': path.resolve(root, 'packages/ui/src/index.ts'),
          '@memebattle/ligretto-shared': path.resolve(root, 'packages/ligretto-shared/src/index.ts'),
          '@memebattle/cas-services/createFrontServices': path.resolve(root, 'packages/cas-services/src/createFrontServices.ts'),
          '@memebattle/cas-services': path.resolve(root, 'packages/cas-services/src/index.ts'),
          '@memebattle/auth-front': path.resolve(root, 'apps/auth-front/src/module.tsx'),
        },
      },
    })
  },
}

export default config
