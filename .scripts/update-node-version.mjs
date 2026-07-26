#!/usr/bin/env node
/**
 * Updates the pinned Node.js version across the monorepo.
 *
 * Sources of truth that are kept in sync:
 *   - .npmrc                 use-node-version=<major>.<minor>.<patch>
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NODE_DIST_INDEX = 'https://nodejs.org/dist/index.json'
const TYPES_NODE_REGISTRY = 'https://registry.npmjs.org/@types/node'

const NPMRC = join(ROOT, '.npmrc')
const PACKAGE_JSON = join(ROOT, 'package.json')
const PNPM_WORKSPACE = join(ROOT, 'pnpm-workspace.yaml')
const DOCKER_DIR = join(ROOT, '.docker')

const NPMRC_RE = /^(use-node-version\s*=\s*)(\d+\.\d+\.\d+)$/m
const ENGINES_RE = /("node"\s*:\s*">=)(\d+\.\d+(?:\.\d+)?)(")/
const DOCKER_FROM_RE = /^(FROM node:)(\d+\.\d+(?:\.\d+)?)(-)/gm
const TYPES_NODE_RE = /^(\s*'@types\/node':\s*)(\d+\.\d+\.\d+)$/m

function parseArgs(argv) {
  const args = { check: false, latestLts: false, types: true, version: null }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--check') {
      args.check = true
    } else if (arg === '--latest-lts') {
      args.latestLts = true
    } else if (arg === '--no-types') {
      args.types = false
    } else if (arg === '--version') {
      args.version = argv[++i]
    } else if (arg.startsWith('--version=')) {
      args.version = arg.slice('--version='.length)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (args.version && !/^v?\d+\.\d+\.\d+$/.test(args.version)) {
    throw new Error(`--version expects a full x.y.z version, got: ${args.version}`)
  }

  return { ...args, version: args.version?.replace(/^v/, '') ?? null }
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
    [NPMRC, content => content.replace(NPMRC_RE, `$1${nodeVersion}`)],
    [PACKAGE_JSON, content => content.replace(ENGINES_RE, `$1${major}.${minor}$3`)],
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
  const args = parseArgs(process.argv.slice(2))

  const currentNode = await readPinnedVersion(NPMRC, NPMRC_RE, 'use-node-version')
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
