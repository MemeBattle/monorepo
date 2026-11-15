/// <reference types="vitest" />

import * as path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { configDefaults } from 'vitest/config'
import type { BuildConditionGroups } from '@memebattle/build-conditions'
import { buildConditions } from '@memebattle/build-conditions-vite'
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

type Target = BuildConditionGroups['target']

const TARGETS: readonly Target[] = ['web', 'telegram']

const OUT_DIRS: Record<Target, string> = {
  web: 'dist',
  telegram: 'dist-telegram',
}

const readTarget = (value: string | undefined): Target => {
  const target = value || 'web'
  if (!TARGETS.includes(target as Target)) {
    throw new Error(`LIGRETTO_TARGET must be one of ${TARGETS.join(', ')}, got "${target}"`)
  }
  return target as Target
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const target = readTarget(process.env.LIGRETTO_TARGET)
  const envVariables = ENV_VARIABLES_SHARED_TO_BROWSER.reduce(
    (exposed, variable) => ({ ...exposed, [`process.env.${variable}`]: JSON.stringify(env[variable]) }),
    {},
  )
  return {
    plugins: [buildConditions({ groups: { target: TARGETS }, conditions: { target } }), react(), svgr()],
    define: envVariables,
    // The origin the local CAS's `ligretto` client returns to; 5173 is the CAS frontend's.
    server: {
      port: 5174,
      strictPort: true,
    },
    build: {
      outDir: OUT_DIRS[target],
      sourcemap: true,
    },
    test: {
      setupFiles: ['./.config/setup.ts'],
      exclude: [...configDefaults.exclude, 'e2e'],
    },
  }
})
