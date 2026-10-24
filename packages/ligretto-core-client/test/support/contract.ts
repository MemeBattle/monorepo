/**
 * What makes the contract suites a check of the documents rather than of the client alone: every answer a recorded
 * client gets is validated against the committed document, and the suite fails unless every declared
 * `(operation, status, error code)` triple was produced by some case.
 */
import { readFileSync } from 'node:fs'

import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ValidateFunction } from 'ajv'
import { expect } from 'vitest'

import type { AnyResult, Client } from '../../src/client'

/** The parts of an OpenAPI 3.1 document the recorder reads. */
interface Schema {
  $ref?: string
  anyOf?: Schema[]
  oneOf?: Schema[]
  properties?: Record<string, Schema>
  enum?: unknown[]
  const?: unknown
}

interface ResponseObject {
  content?: Record<string, { schema?: Schema }>
}

export interface OpenApiDocument {
  paths: Record<string, Record<string, { responses: Record<string, ResponseObject> }>>
  components?: { schemas?: Record<string, Schema> }
}

/** A document of apps/ligretto-core as it is on disk, which CI regenerates before the tests. */
export const readDocument = (name: 'openapi.json' | 'openapi.internal.json'): OpenApiDocument =>
  JSON.parse(readFileSync(new URL(`../../../../apps/ligretto-core/${name}`, import.meta.url), 'utf8')) as OpenApiDocument

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']

/** One `(operation, status, code)` triple as a comparable string; `-` is a body without a top-level `error` code. */
const pairOf = (operation: string, status: number | string, code: string | null): string => `${operation} ${status} ${code ?? '-'}`

/** A JSON pointer segment (RFC 6901). */
const escaped = (segment: string): string => segment.replaceAll('~', '~0').replaceAll('/', '~1')

const resolve = (document: OpenApiDocument, schema: Schema): Schema => {
  const name = schema.$ref?.replace(/^#\/components\/schemas\//, '')
  const resolved = name === undefined ? schema : document.components?.schemas?.[name]
  if (resolved === undefined) {
    throw new Error(`The document has no ${schema.$ref}.`)
  }
  return resolved
}

/** The codes a response schema's top-level `error` admits, through `$ref`, `anyOf` and `oneOf`; `[null]` for none. */
const codesOf = (document: OpenApiDocument, schema: Schema | undefined): (string | null)[] => {
  if (schema === undefined) {
    return [null]
  }
  const resolved = resolve(document, schema)
  const variants = resolved.anyOf ?? resolved.oneOf
  if (variants !== undefined) {
    return [...new Set(variants.flatMap(variant => codesOf(document, variant)))]
  }
  const error = resolved.properties?.error
  if (error === undefined) {
    return [null]
  }
  const values = error.enum ?? (error.const === undefined ? [] : [error.const])
  const codes = values.filter((value): value is string => typeof value === 'string')
  return codes.length === 0 ? [null] : codes
}

/** Every `(operation, status, code)` the document declares, `operation` being `'<METHOD> <path>'`. */
export const declaredPairs = (document: OpenApiDocument): string[] =>
  Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.filter(method => item[method] !== undefined).flatMap(method =>
      Object.entries(item[method].responses).flatMap(([status, response]) =>
        codesOf(document, response.content?.['application/json']?.schema).map(code => pairOf(`${method.toUpperCase()} ${path}`, status, code)),
      ),
    ),
  )

export interface Recorder {
  /** `client`, with every answer checked against the document and recorded. */
  wrap(client: Client): Client
  /** Every triple a recorded client produced. */
  readonly recorded: ReadonlySet<string>
  readonly document: OpenApiDocument
}

/** The body's top-level `error`, when it is a string: the code a caller branches on. A `HealthReport` has none. */
const codeOfBody = (body: unknown): string | null =>
  typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : null

export const createRecorder = (document: OpenApiDocument): Recorder => {
  const recorded = new Set<string>()
  // The whole document is one schema, so a response schema's `#/components/...` refs resolve against it; each
  // response schema is compiled by its JSON pointer. Not strict: the document carries OpenAPI keywords, and formats
  // (`uuid`) are the server's to enforce.
  const ajv = new Ajv2020({ strict: false, validateFormats: false, validateSchema: false })
  const id = 'https://ligretto-core.test/openapi.json'
  ajv.addSchema({ ...document, $id: id })
  const validators = new Map<string, ValidateFunction>()

  const validatorOf = (path: string, method: string, status: number): ValidateFunction | undefined => {
    const pointer = ['paths', path, method, 'responses', String(status), 'content', 'application/json', 'schema'].map(escaped).join('/')
    if (document.paths[path]?.[method]?.responses[String(status)]?.content?.['application/json']?.schema === undefined) {
      return undefined
    }
    let validate = validators.get(pointer)
    if (validate === undefined) {
      validate = ajv.getSchema(`${id}#/${pointer}`)
      if (validate === undefined) {
        throw new Error(`Ajv cannot compile ${pointer}.`)
      }
      validators.set(pointer, validate)
    }
    return validate
  }

  const record = (method: string, path: string, result: AnyResult): void => {
    const operation = `${method} ${path}`
    switch (result.kind) {
      case 'unexpected':
        throw new Error(`${operation} answered outside the contract: ${result.status} ${result.body}`)
      case 'transport':
        throw new Error(`${operation} got no response`, { cause: result.cause })
      case 'redirect':
        recorded.add(pairOf(operation, result.status, null))
        return
      case 'success':
      case 'error': {
        const body = result.kind === 'success' ? result.data : result.error
        const validate = validatorOf(path, method.toLowerCase(), result.status)
        if (validate !== undefined && !validate(body)) {
          throw new Error(`${operation} ${result.status} does not match the document: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(body)}`)
        }
        recorded.add(pairOf(operation, result.status, codeOfBody(body)))
      }
    }
  }

  return {
    wrap: client => async config => {
      const result = await client(config)
      record(config.method, config.url, result)
      return result
    },
    recorded,
    document,
  }
}

/** Every declared triple was produced, and nothing else: the readable diff lists what is missing. */
export const expectEveryPairExercised = (recorder: Recorder): void => {
  expect([...recorder.recorded].sort()).toEqual(declaredPairs(recorder.document).sort())
}

/** The cookies a browser would send back after `headers`: every `Set-Cookie`, without its attributes. */
export const cookiesOf = (headers: Headers): string =>
  headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ')
