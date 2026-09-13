import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: ['dist/', '**/chart/**/*.yaml', '**/.adonisjs/**', '.next', 'next-env.d.ts', 'apps/cas/*', '!apps/cas/README.md'],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
