/// <reference types="vitest" />

import * as path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

const ENV_VARIABLES_SHARED_TO_BROWSER = [
  'LIGRETTO_CORE_URL',
  'LIGRETTO_GAMEPLAY_URL',
  'CAS_URL',
  'AMPLITUDE_TOKEN',
  'LIGRETTO_FRONTEND_SENTRY_DSN',
  'LIGRETTO_APP_ENV',
  'LIGRETTO_APP_VERSION',
]

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const envVariables = ENV_VARIABLES_SHARED_TO_BROWSER.reduce(
    (exposed, variable) => ({ ...exposed, [`process.env.${variable}`]: JSON.stringify(env[variable]) }),
    {},
  )
  return {
    plugins: [react(), svgr()],
    define: envVariables,
    // The origin the local CAS's `ligretto` client returns to; 5173 is the CAS frontend's.
    server: {
      port: 5174,
      strictPort: true,
    },
    build: {
      sourcemap: true,
    },
    test: {
      setupFiles: ['./.config/setup.ts'],
      exclude: [...configDefaults.exclude, 'e2e'],
    },
  }
})
