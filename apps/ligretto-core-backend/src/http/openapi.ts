import type { OpenAPIHono } from '@hono/zod-openapi'

import type { AppEnv } from './types'

/** The version of the documents; the contract changes additively, so it stays until a breaking change. */
const VERSION = '0.1.0'

type App = OpenAPIHono<AppEnv>

/** `openapi.internal.json`: the document of `createInternalApp`, for the gameplay backend's generated client. */
export const internalApiDocument = (app: App) =>
  app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: 'ligretto-core internal API',
      version: VERSION,
      description: 'Games and rounds for the gameplay backend, behind the shared secret LIGRETTO_INTERNAL_API_TOKEN.',
    },
  })

/** `openapi.json`: the document of `createPublicApp`. */
export const publicApiDocument = (app: App) =>
  app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: 'ligretto-core API',
      version: VERSION,
      description: 'The public API of ligretto-core.',
    },
  })
