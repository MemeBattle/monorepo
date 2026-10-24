/**
 * Removes the `= {}` default kubb prints for the `options` of an operation with no required parameter or body, such
 * as `getHealth`, `getMe` or `createGame`. `client` is required in `Options` (`src/client.ts`), because the default
 * client is a guard that always throws, so `{}` is not a valid `options` and a call must not compile without one.
 * plugin-client has no switch for that default.
 *
 * The rewrite is exact: the signature kubb prints today, `(options: Options<<Name>Options, ThrowOnError> = {})`. If
 * kubb ever prints it differently, the default stays and `pnpm ts-check` fails on it, so a drift cannot pass silently.
 * Every operation file must carry an `options: Options<` parameter, or this script throws.
 *
 * Dev-time only. It runs under Node, after `kubb generate`; nothing in `src/` imports it.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const directories = ['public', 'internal'].map(directory => new URL(`../src/generated/${directory}/operations/`, import.meta.url))

const DEFAULTED = /(\(options: Options<\w+, ThrowOnError>) = \{\}\)/g

for (const directory of directories) {
  for (const name of readdirSync(directory).filter(file => file.endsWith('.ts') && file !== 'index.ts')) {
    const url = new URL(name, directory)
    const source = readFileSync(url, 'utf8')
    if (!source.includes('(options: Options<')) {
      throw new Error(`${url.pathname} has no \`options: Options<…>\` parameter: kubb changed what it prints.`)
    }
    const rewritten = source.replace(DEFAULTED, '$1)')
    if (rewritten !== source) {
      writeFileSync(url, rewritten)
    }
  }
}
