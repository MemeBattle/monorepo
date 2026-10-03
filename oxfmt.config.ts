import { defineConfig } from 'oxfmt'

export default defineConfig({
  // Keep the generated MSW worker byte-for-byte reproducible with `msw init`.
  ignorePatterns: [
    '.storybook/public/mockServiceWorker.js',
    'dist/',
    '**/chart/**/*.yaml',
    '**/.adonisjs/**',
    '.next',
    'next-env.d.ts',
    'apps/cas/*',
    '!apps/cas/README.md',
  ],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
