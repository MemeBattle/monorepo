import { defineConfig } from 'kubb/config'
import { pluginClient } from '@kubb/plugin-client'
import { pluginTs } from '@kubb/plugin-ts'

// This package is a client of the OIDC protocol surface only: discovery, the JWKS, the token endpoint, userinfo and
// the two browser navigations. The `/api/*` JSON API is the dashboard's, and belongs to cas-frontend.
const oidcOnly = [{ type: 'path' as const, pattern: /^\/oidc\/|^\/\.well-known\// }]

export default defineConfig({
  root: '.',
  input: '../../apps/cas/openapi.json',
  output: { path: './src/generated', clean: true },
  plugins: [
    pluginTs({ output: { path: 'models' }, include: oidcOnly, enum: { type: 'inlineLiteral' } }),
    pluginClient({ output: { path: 'operations' }, include: oidcOnly, importPath: '#client' }),
  ],
})
