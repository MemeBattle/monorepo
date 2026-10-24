/**
 * Adonis's `HttpContext` as the web `Request`/`Response` pair `@memebattle/ligretto-auth`'s handlers are written
 * against — transport and nothing else, so the routes of `AuthController` add no behaviour of their own.
 *
 * Two details make this a named helper with tests over it rather than a line in each action:
 *
 * - `Set-Cookie` is taken from `getSetCookie()` and appended one value at a time. A callback sends two of them —
 *   the session it installs and the state it takes back — and `Headers.forEach` folds repeated headers into one
 *   comma-joined value that no browser splits back correctly.
 * - The body is written as a `Buffer`, so Adonis sends the bytes the handler produced instead of reserializing a
 *   parsed object, and the handler's own `Content-Type` survives (`safeHeader` leaves a header already set alone).
 *
 * A throw is left to the framework: `createAuthHandlers` answers every known CAS failure as a 4xx or a 503 itself,
 * so anything reaching here is a bug, which is what a 500 is for.
 */

import type { HttpContext } from '@adonisjs/core/http'

export type WebHandler = (request: Request) => Promise<Response>

/**
 * The incoming request as a web `Request`. No body is read: all four routes are `GET` by the package's contract,
 * and `completeUrl(true)` carries the query the callback reads its `state` and `code` from.
 */
const requestOf = (ctx: HttpContext): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(ctx.request.headers())) {
    if (value === undefined) {
      continue
    }
    for (const one of Array.isArray(value) ? value : [value]) {
      headers.append(name, one)
    }
  }
  return new Request(ctx.request.completeUrl(true), { method: ctx.request.method(), headers })
}

export const handleWith = async (ctx: HttpContext, handler: WebHandler): Promise<void> => {
  const answer = await handler(requestOf(ctx))

  ctx.response.status(answer.status)
  answer.headers.forEach((value, name) => {
    if (name !== 'set-cookie') {
      ctx.response.header(name, value)
    }
  })
  for (const cookie of answer.headers.getSetCookie()) {
    ctx.response.append('set-cookie', cookie)
  }

  const body = Buffer.from(await answer.arrayBuffer())
  // An empty body goes as `null`, not as an empty buffer: a redirect would otherwise be given a `Content-Type` of
  // `application/octet-stream` for no bytes at all.
  ctx.response.send(body.byteLength === 0 ? null : body)
}
