import { defineConfig, configDefaults } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, '**/__tests__/*.fixture.ts'],
  },
})
