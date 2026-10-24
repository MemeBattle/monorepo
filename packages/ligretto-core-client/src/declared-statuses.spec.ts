// The generated map the transport classifies by, against the documents it was generated from: read here directly, so
// a generator that drops, adds or misreads a status fails.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { declaredStatuses } from './generated/declared-statuses'

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']

type Document = { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> }

const statusesOf = (name: string): [string, number[]][] => {
  const document = JSON.parse(readFileSync(new URL(`../../../apps/ligretto-core/${name}`, import.meta.url), 'utf8')) as Document
  return Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.filter(method => item[method] !== undefined).map((method): [string, number[]] => [
      `${method.toUpperCase()} ${path}`,
      Object.keys(item[method].responses).map(Number),
    ]),
  )
}

describe('declaredStatuses', () => {
  const declared = [...statusesOf('openapi.json'), ...statusesOf('openapi.internal.json')]

  it.each(declared)('lists exactly the statuses %s declares', (operation, statuses) => {
    expect([...(declaredStatuses[operation] ?? [])].sort()).toEqual([...statuses].sort())
  })

  it('lists no operation that neither document has', () => {
    expect(Object.keys(declaredStatuses).sort()).toEqual([...new Set(declared.map(([operation]) => operation))].sort())
  })
})
