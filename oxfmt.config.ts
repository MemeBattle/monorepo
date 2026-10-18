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
    // Third-party sources kept byte for byte; see each crate's VENDOR.md.
    'vendor/',
  ],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
