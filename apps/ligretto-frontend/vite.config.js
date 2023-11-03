import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

const ENV_VARIABLES_SHARED_TO_BROWSER = [
  'LIGRETTO_CORE_URL',
  'LIGRETTO_GAMEPLAY_URL',
  'CAS_STATIC_URL',
  'CAS_URL',
  'AMPLITUDE_TOKEN',
  'CAS_PARTNER_ID',
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
    test: {
      globals: true,
    },
  }
})
