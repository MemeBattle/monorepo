import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'react'],
  categories: {
    correctness: 'off',
  },
  ignorePatterns: ['**/.adonisjs/**'],
  settings: {
    react: {
      version: '18.2.0',
    },
    next: {
      rootDir: ['apps/blog', 'apps/gamehub-client'],
    },
  },
  overrides: [
    {
      // Next.js App Router RSC: useTranslation from @/i18n is a server-side utility,
      // not a React hook, but its `use` prefix triggers rules-of-hooks incorrectly.
      files: ['apps/blog/**'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
      },
    },
  ],
  rules: {
    'typescript/adjacent-overload-signatures': 'error',
    'typescript/ban-types': 'error',
    'typescript/no-empty-interface': 'error',
    'typescript/no-misused-new': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-var-requires': 'error',
    'typescript/prefer-for-of': 'error',
    'typescript/prefer-function-type': 'error',
    'typescript/prefer-namespace-keyword': 'error',
    'typescript/unified-signatures': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
      },
    ],
    'typescript/no-unused-expressions': ['error'],
    'typescript/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        disallowTypeAnnotations: false,
      },
    ],
    'typescript/dot-notation': 'error',
    'arrow-body-style': 'error',
    'constructor-super': 'error',
    curly: 'error',
    eqeqeq: ['error', 'smart'],
    'guard-for-in': 'error',
    'no-bitwise': 'error',
    'no-caller': 'error',
    'no-cond-assign': 'error',
    'no-debugger': 'error',
    'no-empty': 'error',
    'no-eval': 'error',
    'no-new-wrappers': 'error',
    'no-throw-literal': 'error',
    'no-unsafe-finally': 'error',
    'no-unused-labels': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    radix: 'error',
    'use-isnan': 'error',
    'react-hooks/exhaustive-deps': 'error',
    'react-hooks/rules-of-hooks': 'error',
    'react/jsx-curly-brace-presence': [
      'error',
      {
        props: 'never',
        children: 'never',
        propElementValues: 'always',
      },
    ],
  },
})
