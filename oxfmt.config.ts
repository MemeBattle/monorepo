import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: ['dist/', '**/chart/**/*.yaml', '**/.adonisjs/**', '.next', 'next-env.d.ts'],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
