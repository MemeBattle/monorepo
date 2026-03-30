import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: ['dist/', '**/chart/**/*.yaml', '**/.adonisjs/**'],
  singleQuote: true,
  arrowParens: 'avoid',
  semi: false,
  printWidth: 150,
})
