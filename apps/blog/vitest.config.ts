import { defineConfig, configDefaults } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'node:path'

import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, '**/__tests__/*.fixture.ts'],
  },
  resolve: {
    alias: {
      'contentlayer/generated': path.resolve(__dirname, '../.contentlayer/generated'),
    },
  },
})
