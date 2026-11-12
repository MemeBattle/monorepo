/**
 * Narrows what the per-operation model files of `@kubb/plugin-ts` export to what is imported from outside the file:
 * `<Operation>Options`, which the generated operation takes, and `<Operation>Responses`, which it answers with and from
 * which a caller derives the success body and the error codes. plugin-ts has no switch for this and exports every
 * declaration it prints.
 *
 * - `<Operation>Status<code>`, `<Operation>Path`, `<Operation>Query`, `<Operation>Headers` and `<Operation>Body` are
 *   the parts `Options` and `Responses` are built from: they stay, without `export`.
 * - `<Operation>Response`, the union of every response, is referenced by nothing and is removed.
 * - Every other declaration, such as a component schema printed into the same file, is left as kubb printed it.
 *
 * The rewrite is exact. A part that nothing else in its file references, or a union that something does, throws: kubb
 * changed what it prints, and the rule above has to be revisited rather than applied blindly.
 *
 * Dev-time only. It runs under Node after `kubb generate`, with the models directory as its argument, from the
 * `generate:api` script of a package whose generated models are private to it; nothing in `src/` imports it.
 *
 * Usage: node .scripts/narrow-kubb-models.mjs <models directory>
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [directoryArgument] = process.argv.slice(2)
if (directoryArgument === undefined) {
  throw new Error('Usage: node .scripts/narrow-kubb-models.mjs <models directory>')
}
const directory = resolve(directoryArgument)

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** How many times `name` occurs in `source` as a whole identifier. */
const occurrences = (source, name) => source.match(new RegExp(`\\b${escape(name)}\\b`, 'g'))?.length ?? 0

const narrow = (file, source) => {
  const operation = source.match(/^export type (\w+)Responses = /m)?.[1]
  if (operation === undefined) {
    return source
  }
  const declared = [...source.matchAll(/^export type (\w+)\b/gm)].map(([, name]) => name)
  if (!declared.includes(`${operation}Options`)) {
    throw new Error(`${file} declares ${operation}Responses but no ${operation}Options: kubb changed what it prints.`)
  }

  const part = new RegExp(`^${escape(operation)}(?:Status\\d{3}\\w*|Path|Query|Headers|Body)$`)
  let narrowed = source
  for (const name of declared.filter(name => part.test(name))) {
    if (occurrences(narrowed, name) < 2) {
      throw new Error(`${file}: nothing in the file references ${name}, so it cannot become private.`)
    }
    narrowed = narrowed.replace(new RegExp(`^export type ${escape(name)} =`, 'm'), `type ${name} =`)
  }

  const union = `${operation}Response`
  if (declared.includes(union)) {
    const declaration = new RegExp(`^(?:/\\*\\*\\n(?: .*\\n)*\\*/\\n)?export type ${escape(union)} = [^;]*;\\n?`, 'm')
    if (!declaration.test(narrowed)) {
      throw new Error(`${file}: ${union} is not printed as a single union: kubb changed what it prints.`)
    }
    narrowed = narrowed.replace(declaration, '')
    if (occurrences(narrowed, union) > 0) {
      throw new Error(`${file}: ${union} is referenced in the file, so it cannot be removed.`)
    }
  }
  return narrowed.replace(/\n+$/, '\n')
}

for (const name of readdirSync(directory).filter(file => file.endsWith('.ts') && file !== 'index.ts')) {
  const file = join(directory, name)
  const source = readFileSync(file, 'utf8')
  const narrowed = narrow(file, source)
  if (narrowed !== source) {
    writeFileSync(file, narrowed)
  }
}
