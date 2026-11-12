import { defineConfig } from 'kubb/config'
import { adapterOas } from '@kubb/adapter-oas'
import { pluginClient } from '@kubb/plugin-client'
import { pluginTs } from '@kubb/plugin-ts'

// This package is a client of the OIDC protocol surface only: discovery, the JWKS, the token endpoint, userinfo and
// the two browser navigations. The `/api/*` JSON API is the dashboard's, and belongs to cas-frontend.
const oidcOnly = [{ type: 'path' as const, pattern: /^\/oidc\/|^\/\.well-known\// }]
// Of those, the operations nothing here calls: `authorize` is a navigation `cas-client.ts` builds the URL of, and the
// `HEAD` and the second-method variants are never sent.
const neverCalled = [
  { type: 'operationId' as const, pattern: /^(?:authorize|authorize_head|end_session_by_query|end_session_head|userinfo_by_post)$/ },
]

export default defineConfig({
  root: '.',
  input: '../../apps/cas/openapi.json',
  output: { path: './src/generated', clean: true },
  // `integerType` defaults to `bigint`, which is exact for a 64-bit id but is not what JSON.parse produces: the
  // token endpoint's `expires_in` arrives as a JavaScript number, so `number` is the type the transport delivers.
  adapter: adapterOas({ integerType: 'number' }),
  plugins: [
    pluginTs({ output: { path: 'models' }, include: oidcOnly, exclude: neverCalled, enum: { type: 'inlineLiteral' } }),
    // plugin-client prints a `throwOnError` option into every operation and cannot leave it out; `false` makes the
    // printed default say what `src/client.ts` does: an error CAS answered with comes back as a value.
    pluginClient({ output: { path: 'operations' }, include: oidcOnly, exclude: neverCalled, importPath: '#client', throwOnErrorDefault: false }),
  ],
})
