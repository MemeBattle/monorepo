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
  ],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
