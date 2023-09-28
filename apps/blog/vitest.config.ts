import { defineConfig, configDefaults } from 'vitest/config'
import { loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'node:path'

import react from '@vitejs/plugin-react'

const ENV_VARIABLES_SHARED_TO_TESTS = ['APP_HOST_URL']

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, './'), '')
  const envVariables = ENV_VARIABLES_SHARED_TO_TESTS.reduce(
    (exposed, variable) => ({ ...exposed, [`process.env.${variable}`]: JSON.stringify(env[variable]) }),
    {},
  )

  return {
    plugins: [react(), tsconfigPaths()],
    define: envVariables,
    test: {
      globals: true,
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, '**/__tests__/*.fixture.ts'],
    },
    resolve: {
      alias: {
        'contentlayer/generated': path.resolve(__dirname, '../.contentlayer/generated'),
      },
    },
  }
})
