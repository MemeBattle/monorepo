import { fileURLToPath } from 'node:url'

import dotenv from '@codexsoft/dotenv-flow'

type LoadDevelopmentEnvOptions = {
  /** The environment the decision is made on; `process.env` by default. The files are always written to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** The directory of this package's `.env*` files. */
  packageDir?: string
  /** The directory of the monorepo's root `.env*` files. */
  rootDir?: string
}

/**
 * The one development environment loader of the Node-side entries (`node.ts`, `migrate.ts`, `codegen.ts`), so they
 * cannot disagree on `DATABASE_URL`. Precedence: the shell, then this package's `.env.development.local` and
 * `.env.development`, then the root files. dotenv-flow never overrides a variable that is already set, so loading
 * the package directory first is what makes it win over the root. Production sets the environment itself and reads
 * no file.
 */
export const loadDevelopmentEnv = ({
  env = process.env,
  packageDir = fileURLToPath(new URL('../../', import.meta.url)),
  rootDir = fileURLToPath(new URL('../../../../', import.meta.url)),
}: LoadDevelopmentEnvOptions = {}): void => {
  if (env.NODE_ENV === 'production') {
    return
  }
  const node_env = env.NODE_ENV || 'development'
  dotenv.config({ node_env, path: packageDir, silent: true })
  dotenv.config({ node_env, path: rootDir, silent: true })
}
