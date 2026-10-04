import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In production the SPA and CAS share one origin: the app calls relative
// `/api/...` paths, and the sign-in screens send the browser on to the
// `/oidc/...` navigation `return_to` leads to. In development vite proxies both
// prefixes to the CAS dev server; point CAS_API_PROXY_TARGET elsewhere when it
// does not listen on :3000.
const casApiProxyTarget = process.env.CAS_API_PROXY_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  // `compiler: true` runs the Rust React Compiler (oxc-transform-react), which
  // keeps Babel out of the pipeline.
  plugins: [react({ compiler: true }), tailwindcss()],
  server: {
    proxy: {
      '/api': casApiProxyTarget,
      '/oidc': casApiProxyTarget,
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
})
