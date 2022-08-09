// @ts-check

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  resolver: 'ts-jest-resolver',
  setupFiles: ['<rootDir>/test/setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.spec.json',
    },
  },
}
