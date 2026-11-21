import { defineConfig } from 'kubb/config'
import { adapterOas } from '@kubb/adapter-oas'
import { pluginClient } from '@kubb/plugin-client'
import { pluginTs } from '@kubb/plugin-ts'

/**
 * One client per document of apps/ligretto-core-backend: the public API (the root entry, for ligretto-frontend) and the
 * internal API (`./internal`, for ligretto-gameplay-backend). The two differ only in input and output path.
 */
const clientOf = (document: string, directory: string) => ({
  root: '.',
  input: `../../apps/ligretto-core-backend/${document}`,
  // `clean` empties the directory first, so an operation removed from the document disappears from the client. The
  // named barrel is the module each entry re-exports: every operation and model by name.
  output: { path: `./src/generated/${directory}`, clean: true, barrel: { type: 'named' as const } },
  // `integerType` defaults to `bigint`, which is not what JSON.parse produces: a score or `expiresAt` arrives as a
  // JavaScript number, so `number` is the type the transport delivers.
  adapter: adapterOas({ integerType: 'number' }),
  plugins: [
    // Literal unions rather than enum objects: the codes are compared as strings, and there is nothing to import.
    pluginTs({ output: { path: 'models' }, enum: { type: 'inlineLiteral' } }),
    // Every operation calls the transport of `src/client.ts` through `#client`. plugin-client prints a `throwOnError`
    // option into every operation and cannot leave it out; `false` makes the printed default say what the transport
    // does: every answer comes back as a result, none is thrown.
    pluginClient({ output: { path: 'operations' }, importPath: '#client', throwOnErrorDefault: false }),
  ],
})

export default defineConfig([clientOf('openapi.json', 'public'), clientOf('openapi.internal.json', 'internal')])
