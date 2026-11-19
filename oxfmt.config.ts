import { defineConfig } from 'oxfmt'

export default defineConfig({
  // Keep the generated MSW worker byte-for-byte reproducible with `msw init`.
  ignorePatterns: [
    '.storybook/public/mockServiceWorker.js',
    'dist/',
    '**/chart/**/*.yaml',
    '.next',
    'next-env.d.ts',
    'apps/cas/*',
    '!apps/cas/README.md',
    'apps/cas-frontend/src/shared/api/generated/**',
    'packages/ligretto-auth/src/generated/**',
    'packages/ligretto-core-client/src/generated/**',
    // Generated and diffed in CI: the formatter would collapse short arrays and the diff would fail.
    'apps/ligretto-core-backend/src/adapters/pg/schema.generated.ts',
    'apps/ligretto-core-backend/openapi.json',
    'apps/ligretto-core-backend/openapi.internal.json',
    // Third-party sources kept byte for byte; see each crate's VENDOR.md.
    'vendor/',
  ],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
