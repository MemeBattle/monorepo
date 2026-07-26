#!/usr/bin/env node
/**
 * Updates the pinned Node.js version across the monorepo.
 *
 * Sources of truth that are kept in sync:
 *   - package.json           devEngines.runtime.version <major>.<minor>.<patch>
 *   - package.json           engines.node ">=<major>.<minor>"
 *   - .docker/*_Dockerfile   FROM node:<major>.<minor>-trixie-slim
 *   - pnpm-workspace.yaml    catalog['@types/node'], kept on the same major
 *
 * Usage:
 *   node .scripts/update-node-version.mjs                # latest LTS of the current major
 *   node .scripts/update-node-version.mjs --latest-lts   # latest LTS of any major
 *   node .scripts/update-node-version.mjs --version 24.18.0
 *   node .scripts/update-node-version.mjs --no-types     # leave @types/node alone
 *   node .scripts/update-node-version.mjs --check        # report only, exit 1 when outdated
 *
 * Changing @types/node touches the catalog, so `pnpm install --no-frozen-lockfile`
 * has to run afterwards to refresh pnpm-lock.yaml.
 *
 * When running in GitHub Actions the result is also written to $GITHUB_OUTPUT
 * as `current`, `target`, `types_current`, `types_target` and `updated`.
 */

import { readdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NODE_DIST_INDEX = 'https://nodejs.org/dist/index.json'
const TYPES_NODE_REGISTRY = 'https://registry.npmjs.org/@types/node'

const PACKAGE_JSON = join(ROOT, 'package.json')
const PNPM_WORKSPACE = join(ROOT, 'pnpm-workspace.yaml')
const DOCKER_DIR = join(ROOT, '.docker')

// devEngines.runtime is what pnpm downloads and runs; `[^}]*?` keeps the match
// inside the runtime object, so engines.node below is never touched by mistake.
const DEV_ENGINES_RE = /("runtime"\s*:\s*\{[^}]*?"version"\s*:\s*")(\d+\.\d+\.\d+)(")/
const ENGINES_RE = /("node"\s*:\s*">=)(\d+\.\d+(?:\.\d+)?)(")/
const DOCKER_FROM_RE = /^(FROM node:)(\d+\.\d+(?:\.\d+)?)(-)/gm
const TYPES_NODE_RE = /^(\s*'@types\/node':\s*)(\d+\.\d+\.\d+)$/m

const CLI_OPTIONS = {
  check: { type: 'boolean', default: false },
  'latest-lts': { type: 'boolean', default: false },
  // parseArgs has no `--no-*` negation, so the opt-out is a flag of its own.
  'no-types': { type: 'boolean', default: false },
  version: { type: 'string' },
}

function readArgs() {
  // strict mode rejects unknown flags and missing `--version` values for us.
  const { values } = parseArgs({ options: CLI_OPTIONS })

  if (values.version && !/^v?\d+\.\d+\.\d+$/.test(values.version)) {
    throw new Error(`--version expects a full x.y.z version, got: ${values.version}`)
  }

  return {
    check: values.check,
    latestLts: values['latest-lts'],
    types: !values['no-types'],
    version: values.version?.replace(/^v/, '') ?? null,
  }
}

/** Reads `pattern` out of `path` and returns the captured version. */
async function readPinnedVersion(path, pattern, description) {
  const match = (await readFile(path, 'utf8')).match(pattern)

  if (!match) {
    throw new Error(`Could not find ${description} in ${path.slice(ROOT.length + 1)}`)
  }

  return match[2]
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/** Resolves the release to update to: latest LTS, either within `major` or across all majors. */
async function resolveNodeVersion({ major, latestLts }) {
  const releases = await fetchJson(NODE_DIST_INDEX)
  // The index is ordered newest first, so the first match is the latest release.
  const target = releases.find(release => release.lts !== false && (latestLts || release.version.startsWith(`v${major}.`)))

  if (!target) {
    throw new Error(`No LTS release found for Node.js ${latestLts ? '(any major)' : major}`)
  }

  return target.version.replace(/^v/, '')
}

/**
 * Resolves the newest @types/node on `major`. The package follows the Node.js major
 * but not its minors, so the two versions are never expected to match exactly.
 */
async function resolveTypesVersion(major, current) {
  // The abbreviated metadata is orders of magnitude smaller than the full document.
  const metadata = await fetchJson(TYPES_NODE_REGISTRY, { accept: 'application/vnd.npm.install-v1+json' })
  const candidates = Object.keys(metadata.versions)
    .filter(version => new RegExp(`^${major}\\.\\d+\\.\\d+$`).test(version))
    .sort((a, b) => {
      const left = a.split('.').map(Number)
      const right = b.split('.').map(Number)

      return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
    })

  if (candidates.length === 0) {
    console.warn(`No @types/node released for Node.js ${major} yet, keeping ${current}`)

    return current
  }

  return candidates.at(-1)
}

async function listDockerfiles() {
  const entries = await readdir(DOCKER_DIR)

  return entries.filter(entry => entry.endsWith('_Dockerfile')).map(entry => join(DOCKER_DIR, entry))
}

/** Applies `replace` to a file and reports whether anything actually changed. */
async function updateFile(path, replace) {
  const content = await readFile(path, 'utf8')
  const next = replace(content)

  if (next === content) {
    return false
  }

  await writeFile(path, next)

  return true
}

async function applyUpdate({ nodeVersion, typesVersion }) {
  const [major, minor] = nodeVersion.split('.')
  const changed = []

  const updates = [
    // Both pins live in package.json, so they are rewritten in a single pass.
    [PACKAGE_JSON, content => content.replace(DEV_ENGINES_RE, `$1${nodeVersion}$3`).replace(ENGINES_RE, `$1${major}.${minor}$3`)],
    [PNPM_WORKSPACE, content => content.replace(TYPES_NODE_RE, `$1${typesVersion}`)],
    ...(await listDockerfiles()).map(path => [path, content => content.replace(DOCKER_FROM_RE, `$1${major}.${minor}$3`)]),
  ]

  for (const [path, replace] of updates) {
    if (await updateFile(path, replace)) {
      changed.push(path.slice(ROOT.length + 1))
    }
  }

  return changed
}

async function writeGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) {
    return
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`)

  await appendFile(process.env.GITHUB_OUTPUT, lines.join(''))
}

async function main() {
  const args = readArgs()

  const currentNode = await readPinnedVersion(PACKAGE_JSON, DEV_ENGINES_RE, 'devEngines.runtime.version')
  const currentTypes = await readPinnedVersion(PNPM_WORKSPACE, TYPES_NODE_RE, "catalog['@types/node']")

  const nodeVersion = args.version ?? (await resolveNodeVersion({ major: currentNode.split('.')[0], latestLts: args.latestLts }))
  const typesVersion = args.types ? await resolveTypesVersion(nodeVersion.split('.')[0], currentTypes) : currentTypes

  console.log(`node:        ${currentNode} -> ${nodeVersion}`)
  console.log(`@types/node: ${currentTypes} -> ${typesVersion}`)

  if (args.check) {
    const outdated = currentNode !== nodeVersion || currentTypes !== typesVersion

    await writeGithubOutput({
      current: currentNode,
      target: nodeVersion,
      types_current: currentTypes,
      types_target: typesVersion,
      updated: String(outdated),
    })

    if (outdated) {
      console.log('An update is available')
      process.exitCode = 1
    } else {
      console.log('Everything is up to date')
    }

    return
  }

  // Even when the pinned versions already match, the Dockerfiles may have drifted,
  // so always let applyUpdate compare the files themselves.
  const changed = await applyUpdate({ nodeVersion, typesVersion })

  await writeGithubOutput({
    current: currentNode,
    target: nodeVersion,
    types_current: currentTypes,
    types_target: typesVersion,
    updated: String(changed.length > 0),
  })

  if (changed.length === 0) {
    console.log('Nothing to update')

    return
  }

  console.log('\nUpdated:')
  for (const path of changed) {
    console.log(`  - ${path}`)
  }
  console.log('\nRun `pnpm install --no-frozen-lockfile` to refresh pnpm-lock.yaml.')
}

await main()
