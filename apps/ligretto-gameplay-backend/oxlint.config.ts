import { defineConfig } from 'oxlint'

import root from '../../oxlint.config.ts'

/**
 * The boundary of this package: the rules know nothing about what runs them. A nested config replaces the root one for
 * the files under it, so the root rules are pulled in through `extends`.
 */
const restrict = (group: string[], message: string) => ['error', { patterns: [{ group, message }] }] as const

const runtimeGlobals = [
  'WebSocket',
  'WebSocketPair',
  'WebSocketRequestResponsePair',
  'DurableObject',
  'DurableObjectState',
  'DurableObjectStorage',
  'SqlStorage',
].map(name => ({
  name,
  message: 'src/core reaches the runtime through its ports; src/cloudflare implements them',
}))

export default defineConfig({
  extends: [root],
  overrides: [
    {
      files: ['src/core/**'],
      rules: {
        'no-restricted-imports': restrict(
          ['node:*', 'cloudflare:*', '@cloudflare/*', '**/cloudflare/**'],
          'src/core imports @memebattle/ligretto-shared and web-standard globals only',
        ),
        'no-restricted-globals': ['error', ...runtimeGlobals],
      },
    },
  ],
})
