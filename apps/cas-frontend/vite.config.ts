import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In production the SPA and the CAS API share one origin, so the app calls
// relative `/api/...` paths. In development vite proxies them to the CAS dev
// server; point CAS_API_PROXY_TARGET elsewhere when it does not listen on :3000.
const casApiProxyTarget = process.env.CAS_API_PROXY_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  // `compiler: true` runs the Rust React Compiler (oxc-transform-react), which
  // keeps Babel out of the pipeline.
  plugins: [react({ compiler: true }), tailwindcss()],
  server: {
    proxy: {
      '/api': casApiProxyTarget,
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.spec.{ts,tsx}'],
  },
})
