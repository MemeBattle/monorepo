module.exports = {
  extends: ['../../.eslintrc.js', 'plugin:import/recommended'],
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
  rules: {
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index', 'object'],
        'newlines-between': 'always',
        pathGroups: [
          {
            pattern: '*.{css,gif,jpeg,png,scss,svg}',
            group: 'object',
            position: 'after',
          },
        ],
      },
    ],
  },
}
