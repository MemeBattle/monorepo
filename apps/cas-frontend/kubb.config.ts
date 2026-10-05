import { defineConfig } from 'kubb/config'
import { pluginClient } from '@kubb/plugin-client'
import { pluginTs } from '@kubb/plugin-ts'

// The SPA calls only the JSON API; the OIDC protocol endpoints are navigations and belong to the clients of CAS.
const apiOnly = [{ type: 'path' as const, pattern: /^\/api\// }]

export default defineConfig({
  root: '.',
  input: '../cas/openapi.json',
  output: { path: './src/shared/api/generated', clean: true },
  plugins: [
    pluginTs({ output: { path: 'models' }, include: apiOnly, enum: { type: 'inlineLiteral' } }),
    pluginClient({ output: { path: 'operations' }, include: apiOnly, importPath: '#shared/api/client' }),
  ],
})
