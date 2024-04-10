/// <reference types="vitest" />

import * as path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { sentryVitePlugin } from "@sentry/vite-plugin";

const ENV_VARIABLES_SHARED_TO_BROWSER = [
  'LIGRETTO_CORE_URL',
  'LIGRETTO_GAMEPLAY_URL',
  'CAS_STATIC_URL',
  'CAS_URL',
  'AMPLITUDE_TOKEN',
  'CAS_PARTNER_ID',
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
    plugins: [react(), svgr(), sentryVitePlugin({
      org: "memebattle-1x",
      project: "ligretto-frontend",
      release: {
        name: process.env.LIGRETTO_APP_VERSION,
        inject: false,
      },
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),],
    define: envVariables,
    build: {
      sourcemap: true,
    },
    test: {
      exclude: [...configDefaults.exclude, 'e2e'],
    },
  }
})
