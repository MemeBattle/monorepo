import { defineConfig } from 'oxlint'

const mswImports = {
  group: ['msw', 'msw/*'],
  message: 'MSW belongs in shared/testing or entities/*/testing. Use domain helpers in specs and stories.',
}
const entityTestingImports = {
  group: [
    '#entities/*/testing',
    '#entities/*/testing/**',
    '**/entities/*/testing',
    '**/entities/*/testing/**',
    './testing',
    './testing/**',
    '../*/testing',
    '../*/testing/**',
  ],
  message: 'Entity testing entry points belong only in specs and stories.',
}
const privateTestingImports = {
  group: ['#entities/*/testing/*', '**/entities/*/testing/*', '**/testing/stages*', '**/testing/options*'],
  message: 'Use the public composite helper. Private stages belong only to the owning entity specs.',
}
const testingDirectories = ['apps/cas-frontend/src/shared/testing/**', 'apps/cas-frontend/src/entities/*/testing/**']
const specsAndStories = ['**/*.spec.*', '**/*.stories.*']

export default defineConfig({
  plugins: ['typescript', 'react', 'import', 'vitest'],
  categories: {
    correctness: 'off',
  },
  ignorePatterns: ['**/.adonisjs/**', '.storybook/public/mockServiceWorker.js'],
  settings: {
    react: {
      version: '19.2.4',
    },
    next: {
      rootDir: ['apps/blog', 'apps/gamehub-client'],
    },
  },
  overrides: [
    {
      files: ['**/*.spec.*', '**/*.test.*', '**/*.e2e.*'],
      rules: { 'vitest/padding-around-test-blocks': 'error' },
    },
    {
      files: ['**/*'],
      rules: { 'no-restricted-imports': ['error', { patterns: [mswImports, entityTestingImports, privateTestingImports] }] },
    },
    {
      files: specsAndStories,
      rules: { 'no-restricted-imports': ['error', { patterns: [mswImports, privateTestingImports] }] },
    },
    {
      files: testingDirectories,
      excludeFiles: specsAndStories,
      rules: { 'no-restricted-imports': ['error', { patterns: [entityTestingImports] }] },
    },
    {
      files: ['apps/cas-frontend/src/shared/testing/**/*.spec.*', 'apps/cas-frontend/src/entities/*/testing/**/*.spec.*'],
      rules: { 'no-restricted-imports': ['error', { patterns: [privateTestingImports] }] },
    },
    {
      files: ['apps/cas-frontend/src/entities/*/*.spec.*'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              mswImports,
              {
                ...privateTestingImports,
                group: [...privateTestingImports.group, '!./testing/stages*', '!./testing/options*'],
              },
            ],
          },
        ],
      },
    },
    {
      // Next.js App Router RSC: useTranslation from @/i18n is a server-side utility,
      // not a React hook, but its `use` prefix triggers rules-of-hooks incorrectly.
      files: ['apps/blog/**'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
      },
    },
    {
      // cas-frontend builds with the React Compiler on (`react({ compiler: true })`),
      // so the compiler's own rules apply there and nowhere else. The rule is in the
      // correctness category, which this config turns off globally.
      files: ['apps/cas-frontend/**'],
      rules: {
        'react/react-compiler': 'error',
      },
    },
  ],
  rules: {
    'import/newline-after-import': 'error',
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
