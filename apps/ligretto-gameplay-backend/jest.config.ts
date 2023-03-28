import type { Config } from 'jest'

const jestConfig: Config = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.spec.json',
      },
    ],
  },
}

export default jestConfig
