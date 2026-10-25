import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadDevelopmentEnv, packageDirOf } from './env.ts'

// A variable no shell sets, so a developer's environment cannot influence the cases; DATABASE_URL resolves the same way.
const KEY = 'LIGRETTO_CORE_ENV_SPEC_VALUE'

describe('loadDevelopmentEnv', () => {
  let packageDir: string
  let rootDir: string

  const write = (dir: string, file: string, value: string) => writeFile(path.join(dir, file), `${KEY}=${value}\n`)
  // An empty environment by default, so the development files load whatever NODE_ENV the test runner set.
  const load = (env: NodeJS.ProcessEnv = {}) => loadDevelopmentEnv({ env, packageDir, rootDir })

  beforeEach(async () => {
    delete process.env[KEY]
    packageDir = await mkdtemp(path.join(tmpdir(), 'ligretto-core-env-package-'))
    rootDir = await mkdtemp(path.join(tmpdir(), 'ligretto-core-env-root-'))
  })

  afterEach(async () => {
    delete process.env[KEY]
    await rm(packageDir, { recursive: true, force: true })
    await rm(rootDir, { recursive: true, force: true })
  })

  it('keeps a value the shell set over every file', async () => {
    await write(packageDir, '.env.development.local', 'package-local')
    await write(packageDir, '.env.development', 'package')
    await write(rootDir, '.env.development', 'root')
    process.env[KEY] = 'shell'
    load()
    expect(process.env[KEY]).toBe('shell')
  })

  it("prefers the package's .env.development.local", async () => {
    await write(packageDir, '.env.development.local', 'package-local')
    await write(packageDir, '.env.development', 'package')
    await write(rootDir, '.env.development', 'root')
    load()
    expect(process.env[KEY]).toBe('package-local')
  })

  // apps/cas/scripts/seed-dev.sh mirrors this order to seed the secret the backend presents.
  it('ranks .env.development above .env.local, and .env.local above .env', async () => {
    await write(packageDir, '.env.development', 'package')
    await write(packageDir, '.env.local', 'package-local-any-env')
    await write(packageDir, '.env', 'package-base')
    load({ NODE_ENV: 'development' })
    expect(process.env[KEY]).toBe('package')

    delete process.env[KEY]
    await rm(path.join(packageDir, '.env.development'))
    load({ NODE_ENV: 'development' })
    expect(process.env[KEY]).toBe('package-local-any-env')
  })

  it("prefers the package's .env.development over the root files", async () => {
    await write(packageDir, '.env.development', 'package')
    await write(rootDir, '.env.development.local', 'root-local')
    await write(rootDir, '.env.development', 'root')
    load()
    expect(process.env[KEY]).toBe('package')
  })

  it('falls back to the root files', async () => {
    await write(rootDir, '.env.development', 'root')
    load()
    expect(process.env[KEY]).toBe('root')
  })

  it('reads no file in production', async () => {
    await write(packageDir, '.env.development', 'package')
    await write(packageDir, '.env.production', 'package-production')
    await write(rootDir, '.env.development', 'root')
    load({ NODE_ENV: 'production' })
    expect(process.env[KEY]).toBeUndefined()
  })
})

describe('packageDirOf', () => {
  const packageDir = path.resolve(tmpdir(), 'apps', 'ligretto-core-backend')
  const moduleUrl = (...segments: string[]) => pathToFileURL(path.join(packageDir, ...segments)).href

  it('finds the package from a source entry', () => {
    expect(packageDirOf(moduleUrl('src', 'entry', 'env.ts'))).toBe(packageDir)
  })

  it('finds the same package from the compiled entry, one level deeper under build/', () => {
    expect(packageDirOf(moduleUrl('build', 'src', 'entry', 'env.js'))).toBe(packageDir)
  })

  it('resolves this module to the package that holds it', () => {
    expect(packageDirOf(import.meta.url)).toBe(path.resolve(import.meta.dirname, '../..'))
  })
})
