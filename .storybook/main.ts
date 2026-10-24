import path from 'path'
import { fileURLToPath } from 'url'
import { mergeConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import tailwindcss from '@tailwindcss/vite'
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
      // Tailwind only touches stylesheets that import it (apps/cas-frontend).
      plugins: [svgr(), tailwindcss()],
      resolve: {
        // Workspace packages are aliased to sources: their injected dist copies
        // live under node_modules, so vite would serve them without CJS interop
        // and their deps would never be prebundled. A subpath alias must come
        // before its bare package alias.
        alias: {
          '@memebattle/ui': path.resolve(root, 'packages/ui/src/index.ts'),
          '@memebattle/ligretto-shared': path.resolve(root, 'packages/ligretto-shared/src/index.ts'),
        },
      },
    })
  },
}

export default config
