import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { vi } from 'vitest'

// The bindings of vitest.worker.config.ts.
const ISSUER = 'http://localhost:3000'
const CORE = 'http://localhost:3333'
const KID = 'cas-test-key'
const JWKS_URI = `${ISSUER}/oidc/jwks.json`

const { privateKey, publicKey } = await generateKeyPair('ES256')
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: KID, alg: 'ES256', use: 'sig' }] }
const discovery = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oidc/authorize`,
  token_endpoint: `${ISSUER}/oidc/token`,
  userinfo_endpoint: `${ISSUER}/oidc/userinfo`,
  end_session_endpoint: `${ISSUER}/oidc/end_session`,
  jwks_uri: JWKS_URI,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['ES256'],
}

export const tokenOf = (sub: string) =>
  new SignJWT({ client_id: 'ligretto', scope: 'openid', amr: ['pwd'], account_type: 'full', jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: 'ES256', kid: KID, typ: 'at+jwt' })
    .setIssuer(ISSUER)
    .setAudience('ligretto')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)

export interface FakeCore {
  /** How many times a game was asked for, created or not. */
  createGameCalls: number
  /** Answers every create with an undeclared 500. */
  createFails: boolean
  savedRounds: Array<{ gameId: string; body: { roundId: string; results: Array<{ playerId: string; score: number }> } }>
  /** What `GET /internal/games/{id}/results` answers, by game; a game with no entry has no rounds. */
  gameResults: Map<string, Record<string, { roundScore: number; gameScore: number }>>
  /** Answers every read of results with an undeclared 500. */
  resultsFail: boolean
}

/** Answers what the Worker reaches outside itself: CAS's metadata and ligretto-core's internal API. */
export const stubOutside = (): FakeCore => {
  const core: FakeCore = { createGameCalls: 0, createFails: false, savedRounds: [], gameResults: new Map(), resultsFail: false }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url === `${ISSUER}/.well-known/openid-configuration`) {
        return Response.json(discovery, { headers: { 'cache-control': 'max-age=3600' } })
      }
      if (url === JWKS_URI) {
        return Response.json(jwks, { headers: { 'cache-control': 'max-age=3600' } })
      }
      if (url === `${CORE}/internal/games` && init?.method === 'POST') {
        core.createGameCalls++
        return core.createFails ? new Response('internal error', { status: 500 }) : Response.json({ id: crypto.randomUUID() }, { status: 201 })
      }
      const rounds = new RegExp(`^${CORE}/internal/games/([^/]+)/rounds$`).exec(url)
      if (rounds) {
        const body = JSON.parse(String(init?.body))
        core.savedRounds.push({ gameId: rounds[1], body })
        const gameResults = Object.fromEntries(
          (body.results as Array<{ playerId: string; score: number }>).map(({ playerId, score }) => [
            playerId,
            { roundScore: score, gameScore: score },
          ]),
        )
        core.gameResults.set(rounds[1], gameResults)
        return Response.json({ gameResults })
      }
      const results = new RegExp(`^${CORE}/internal/games/([^/]+)/results$`).exec(url)
      if (results && (init?.method ?? 'GET') === 'GET') {
        return core.resultsFail
          ? new Response('internal error', { status: 500 })
          : Response.json({ gameResults: core.gameResults.get(results[1]) ?? {} })
      }
      return new Response('unexpected request', { status: 500 })
    }),
  )
  return core
}

export type Client = Awaited<ReturnType<typeof openClient>>

/** The client end of a socket, with what it received so far and a way to wait for more. */
export const openClient = async (worker: Fetcher, path: string, userId: string) => {
  const response = await worker.fetch(`http://gameplay.test${path}?token=${await tokenOf(userId)}`, { headers: { Upgrade: 'websocket' } })
  const socket = response.webSocket
  if (!socket) {
    throw new Error(`No socket: ${response.status}`)
  }
  const received: Array<{ type: string; payload?: unknown }> = []
  const closes: Array<{ code: number; reason: string }> = []
  let notify = () => {}
  socket.addEventListener('message', event => {
    if (typeof event.data === 'string' && event.data !== 'pong') {
      received.push(JSON.parse(event.data))
    }
    notify()
  })
  socket.addEventListener('close', event => {
    closes.push({ code: event.code, reason: event.reason })
    notify()
  })
  socket.accept()

  const until = async <T>(check: () => T | undefined): Promise<T> => {
    const deadline = Date.now() + 5_000
    for (;;) {
      const value = check()
      if (value !== undefined) {
        return value
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out; received ${JSON.stringify(received.map(({ type }) => type))}, closes ${JSON.stringify(closes)}`)
      }
      await Promise.race([new Promise<void>(resolve => (notify = resolve)), new Promise(resolve => setTimeout(resolve, 20))])
    }
  }

  return {
    socket,
    received,
    closes,
    send: (action: { type: string; payload?: unknown }) => socket.send(JSON.stringify(action)),
    closed: () => until(() => closes[0]),
    /** The next message of this type at or after `from`, by position in `received`. */
    waitFor: <P = unknown>(creator: { type: string }, from = 0) =>
      until(() => received.slice(from).find(({ type }) => type === creator.type) as { type: string; payload: P } | undefined),
    until,
  }
}
