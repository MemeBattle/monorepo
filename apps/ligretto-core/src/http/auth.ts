import type { RouteConfig } from '@hono/zod-openapi'
import type { AuthHandlers } from '@memebattle/ligretto-auth'
import { authRouteFragments, type AuthResponseFragment, type AuthRouteFragment } from '@memebattle/ligretto-auth/schema'
import type { Context } from 'hono'
import { z } from 'zod'

import { SessionBusyError } from '../core/ports/session-store'
import { sessionBusySchema, type SessionBusy } from '../contract/auth'
import type { BaseApp } from './app'
import type { AppEnv, PublicAppDeps } from './types'

/** Where each handler of `@memebattle/ligretto-auth` is mounted. */
export const AUTH_PATHS = {
  me: '/api/auth/me',
  signIn: '/api/auth/sign-in',
  callback: '/api/auth/callback',
  logout: '/api/auth/logout',
} as const satisfies Record<keyof AuthHandlers, string>

/**
 * The `operationId` of each auth route, which is the generated client's function name: renaming one breaks every
 * consumer (docs/adrs/api-contract-openapi-and-client-package.md). `callback` alone would be too generic an export.
 */
export const AUTH_OPERATION_IDS = {
  me: 'getMe',
  signIn: 'signIn',
  callback: 'authCallback',
  logout: 'logout',
} as const satisfies Record<keyof AuthHandlers, string>

type AuthRoute = keyof typeof AUTH_PATHS

const ROUTES = Object.keys(AUTH_PATHS) as AuthRoute[]

/**
 * Runs a handler on the raw request and answers its `Response` itself: no copy, no re-encoding, every `Set-Cookie`
 * and the `Location` intact. The handlers answer every failure of theirs; the one this service adds is the session
 * store's `SessionBusyError`, a `503 session_busy` that is logged once here. Anything else is a bug and reaches the
 * error handler as the one 500. The log line names no session: the error's message is fixed per reason.
 */
const mount = async (c: Context<AppEnv>, handler: (request: Request) => Promise<Response>): Promise<Response> => {
  try {
    return await handler(c.req.raw)
  } catch (failure) {
    if (!(failure instanceof SessionBusyError)) {
      throw failure
    }
    c.get('logger').error('request_failed', {
      requestId: c.get('requestId'),
      status: 503,
      error: 'session_busy',
      reason: failure.reason,
      errorMessage: failure.message,
    })
    c.header('cache-control', 'no-store')
    return c.json({ error: 'session_busy', description: 'The session is busy; repeat the request' } satisfies SessionBusy, 503)
  }
}

/** The `503` of a fragment with `session_busy` beside the package's codes. */
const withSessionBusy = (response: AuthResponseFragment): AuthResponseFragment => {
  const schema = response.content?.['application/json'].schema
  return {
    description: `${response.description} Or the session's lock was not granted in time (\`session_busy\`).`,
    content: { 'application/json': { schema: schema === undefined ? sessionBusySchema : z.union([schema, sessionBusySchema]) } },
  }
}

/**
 * One route's documentation, independent of the deployment's transport: the fragments of both transports merged, so
 * `sign-in` and `logout` list the cookie transport's `302` and the bearer transport's `200` alike.
 */
const documented = (cookie: AuthRouteFragment, bearer: AuthRouteFragment): AuthRouteFragment => {
  const responses = { ...cookie.responses, ...bearer.responses }
  const differs = Object.keys(responses).some(status => !(status in cookie.responses) || !(status in bearer.responses))
  if (responses['503'] !== undefined) {
    responses['503'] = withSessionBusy(responses['503'])
  }
  const description = differs ? `${cookie.description} \`302\` is the cookie transport's answer, \`200\` the bearer transport's.` : cookie.description
  return { ...cookie, description, responses }
}

/**
 * `GET /api/auth/me|sign-in|callback|logout`: the handlers of `@memebattle/ligretto-auth`, as plain Hono routes with
 * no validator in front, since the package validates its own input once
 * (docs/adrs/api-contract-openapi-and-client-package.md). They are documented from the package's fragments.
 */
export const registerAuth = (app: BaseApp, deps: PublicAppDeps) => {
  const cookie = authRouteFragments('cookie')
  const bearer = authRouteFragments('bearer')

  for (const route of ROUTES) {
    const path = AUTH_PATHS[route]
    app.get(path, c => mount(c, deps.auth[route]))
    // The compile check the fragment type asks for: a fragment and its path are a `RouteConfig`, with no cast.
    const config: RouteConfig = { path, operationId: AUTH_OPERATION_IDS[route], tags: ['auth'], ...documented(cookie[route], bearer[route]) }
    app.openAPIRegistry.registerPath(config)
  }
}
