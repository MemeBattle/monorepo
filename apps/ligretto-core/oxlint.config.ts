import { defineConfig } from 'oxlint'

import root from '../../oxlint.config.ts'

/**
 * The directory boundaries of docs/adrs/layering-and-runtime-neutrality.md. A nested config replaces the root one for
 * the files under it, so the root rules are pulled in through `extends`; `pnpm lint:check` from the repository root
 * discovers this file. A type-only import across a forbidden edge is a violation like any other.
 */
const adr = 'docs/adrs/layering-and-runtime-neutrality.md'

const runtimePackages = ['node:*', 'pg', 'kysely', 'kysely/*', 'cloudflare:*', '@cloudflare/*']
const honoPackages = ['hono', 'hono/*', '@hono/*']

const restrict = (group: string[], message: string) => ['error', { patterns: [{ group, message: `${message} (${adr})` }] }] as const

const noProcess = [
  'error',
  {
    name: 'process',
    message: `Only src/entry reads the environment; take the setting as an argument (docs/adrs/configuration-from-injected-environment.md)`,
  },
] as const

export default defineConfig({
  extends: [root],
  overrides: [
    {
      files: ['src/core/**'],
      rules: {
        'no-restricted-imports': restrict(
          [...runtimePackages, ...honoPackages, '**/contract/**', '**/http/**', '**/adapters/**', '**/entry/**'],
          'src/core imports web-standard globals and zod only',
        ),
        'no-restricted-globals': noProcess,
      },
    },
    {
      files: ['src/contract/**'],
      rules: {
        'no-restricted-imports': restrict(
          [...runtimePackages, ...honoPackages, '**/core/**', '**/http/**', '**/adapters/**', '**/entry/**'],
          'src/contract imports zod and the @memebattle/ligretto-auth schemas only',
        ),
        'no-restricted-globals': noProcess,
      },
    },
    {
      files: ['src/http/**'],
      rules: {
        'no-restricted-imports': restrict(
          [...runtimePackages, '@hono/node-server', '@hono/node-server/*', '**/adapters/**', '**/entry/**'],
          'src/http imports hono, @hono/zod-openapi, src/core and src/contract only',
        ),
        'no-restricted-globals': noProcess,
      },
    },
    {
      files: ['src/adapters/**'],
      rules: {
        'no-restricted-imports': restrict(
          ['node:*', 'cloudflare:*', '@cloudflare/*', ...honoPackages, '**/contract/**', '**/http/**', '**/entry/**'],
          'src/adapters imports kysely, pg and src/core only',
        ),
        'no-restricted-globals': noProcess,
      },
    },
  ],
})
