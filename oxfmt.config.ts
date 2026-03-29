import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: ['dist/', '**/chart/**/*.yaml'],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
