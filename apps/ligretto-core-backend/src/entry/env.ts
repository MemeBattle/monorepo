import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from '@codexsoft/dotenv-flow'

/**
 * The package directory, from the URL of a module in `src/entry`. That module runs from `src/entry` in the source
 * and from `build/src/entry` in the Node build (`outDir: build`, `rootDir: .` in tsconfig.build.json). Two levels up
 * is the package from the source and the package's `build/` from the build; for the build it returns the parent.
 */
export const packageDirOf = (moduleUrl: string | URL): string => {
  const twoUp = path.resolve(fileURLToPath(new URL('../../', moduleUrl)))
  return path.basename(twoUp) === 'build' ? path.dirname(twoUp) : twoUp
}

const modulePackageDir = packageDirOf(import.meta.url)

type LoadDevelopmentEnvOptions = {
  /** The environment the decision is made on; `process.env` by default. The files are always written to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** The directory of this package's `.env*` files. */
  packageDir?: string
  /** The directory of the monorepo's root `.env*` files. */
  rootDir?: string
}

/**
 * The one development environment loader of the Node-side entries (`node.ts`, `migrate.ts`, `codegen.ts`,
 * `sweep.ts`), so they cannot disagree on `DATABASE_URL`. Precedence: the shell, then this package's files in
 * dotenv-flow's order, highest first (`.env.development.local`, `.env.development`, `.env.local`, `.env`,
 * `.env.defaults`), then the root's in the same order. `.env.development` sits above `.env.local`, so only
 * `.env.development.local` overrides a key the committed `.env.development` sets. dotenv-flow never overrides a
 * variable that is already set, so loading the package directory first is what makes it win over the root. Both
 * directories resolve the same from the source and from the build (`packageDirOf`). Production sets the environment
 * itself and reads no file.
 */
export const loadDevelopmentEnv = ({
  env = process.env,
  packageDir = modulePackageDir,
  rootDir = path.resolve(modulePackageDir, '../..'),
}: LoadDevelopmentEnvOptions = {}): void => {
  if (env.NODE_ENV === 'production') {
    return
  }
  const node_env = env.NODE_ENV || 'development'
  dotenv.config({ node_env, path: packageDir, silent: true })
  dotenv.config({ node_env, path: rootDir, silent: true })
}
