import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: [
    'dist/',
    '**/chart/**/*.yaml',
    '**/.adonisjs/**',
    '.next',
    'next-env.d.ts',
    'apps/cas/*',
    '!apps/cas/README.md',
    'apps/cas-frontend/src/shared/api/generated/**',
    'packages/ligretto-auth/src/generated/**',
    // Generated and diffed in CI: the formatter would collapse short arrays and the diff would fail.
    'apps/ligretto-core/src/adapters/pg/schema.generated.ts',
    'apps/ligretto-core/openapi.json',
    'apps/ligretto-core/openapi.internal.json',
    // Third-party sources kept byte for byte; see each crate's VENDOR.md.
    'vendor/',
  ],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
