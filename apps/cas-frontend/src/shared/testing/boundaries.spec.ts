import { spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = resolve(process.cwd(), '../..')
const cases = [
  ['apps/cas-frontend/src/pages/lint-fixture.ts', 'msw', false],
  ['apps/cas-frontend/src/pages/lint-fixture.spec.ts', 'msw/browser', false],
  ['apps/cas-frontend/src/pages/lint-fixture.ts', '#entities/session/testing', false],
  ['apps/cas-frontend/src/pages/lint-fixture.ts', '#entities/session/testing/builders', false],
  ['apps/cas-frontend/src/pages/lint-fixture.spec.ts', '#entities/session/testing', true],
  ['apps/cas-frontend/src/pages/lint-fixture.stories.tsx', '#entities/passkey/testing', true],
  ['apps/cas-frontend/src/shared/testing/lint-fixture.ts', 'msw/node', true],
  ['apps/cas-frontend/src/entities/session/testing/lint-fixture.ts', 'msw', true],
  ['apps/cas-frontend/src/entities/session/testing/lint-fixture.ts', '#entities/passkey/testing', false],
  ['apps/cas-frontend/src/pages/lint-fixture.spec.ts', '#entities/session/testing/stages', false],
  ['apps/cas-frontend/src/pages/lint-fixture.stories.tsx', '#entities/passkey/testing/stages', false],
  ['apps/cas-frontend/src/pages/lint-fixture.spec.ts', '../entities/session/testing/stages', false],
  ['apps/cas-frontend/src/entities/session/lint-fixture.spec.ts', './testing/stages', true],
  ['apps/cas-frontend/src/entities/passkey/lint-fixture.spec.ts', '../session/testing/stages', false],
  ['apps/cas-frontend/src/entities/passkey/lint-fixture.spec.ts', '../session/testing/stages.ts', false],
  ['apps/cas-frontend/src/entities/session/lint-fixture.ts', './testing', false],
] as const
it.each(cases)('enforces %s importing %s (allowed: %s)', (file, source, allowed) => {
  const path = `${root}/${file}`
  try {
    writeFileSync(path, `import { fixture } from '${source}'\nexport { fixture }\n`)
    const result = spawnSync(`${root}/node_modules/.bin/oxlint`, [file], { cwd: root, encoding: 'utf8' })
    expect(result.status, result.stdout + result.stderr).toBe(allowed ? 0 : 1)
    if (!allowed) {
      expect(result.stdout + result.stderr).toContain('no-restricted-imports')
    }
  } finally {
    unlinkSync(path)
  }
})
