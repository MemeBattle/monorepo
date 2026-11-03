// The handshake under workerd, against a fake CAS of its own. Each test names a fresh issuer, because the verifier
// caches CAS's metadata by issuer for the life of the isolate.
import { env } from 'cloudflare:workers'
import { reset } from 'cloudflare:test'
import { updateRoomsAction } from '@memebattle/ligretto-shared'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../../src/cloudflare/env'
import worker from '../../src/cloudflare/worker'

const KID = 'cas-test-key'
const { privateKey, publicKey } = await generateKeyPair('ES256')
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: KID, alg: 'ES256', use: 'sig' }] }
const cacheable = { headers: { 'cache-control': 'max-age=3600' } }

const discoveryOf = (issuer: string) => ({
  issuer,
  authorization_endpoint: `${issuer}/oidc/authorize`,
  token_endpoint: `${issuer}/oidc/token`,
  userinfo_endpoint: `${issuer}/oidc/userinfo`,
  end_session_endpoint: `${issuer}/oidc/end_session`,
  jwks_uri: `${issuer}/oidc/jwks.json`,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['ES256'],
})

type CasState = 'up' | 'failing' | 'stalled'

let issuer: string
let cas: CasState
const casFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (cas === 'failing') {
    return new Response('unavailable', { status: 503 })
  }
  if (cas === 'stalled') {
    return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
  }
  const url = String(input instanceof Request ? input.url : input)
  if (url === `${issuer}/.well-known/openid-configuration`) {
    return Response.json(discoveryOf(issuer), cacheable)
  }
  if (url === `${issuer}/oidc/jwks.json`) {
    return Response.json(jwks, cacheable)
  }
  return new Response('unexpected request', { status: 500 })
})

const nowSeconds = () => Math.floor(Date.now() / 1000)

const tokenOf = ({ audience = 'ligretto', expiresAt = nowSeconds() + 300 } = {}) =>
  new SignJWT({ client_id: 'ligretto', scope: 'openid', amr: ['pwd'], account_type: 'full', jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: 'ES256', kid: KID, typ: 'at+jwt' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('user')
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey)

type Outcome = { message: string } | { code: number; reason: string }

const sockets: WebSocket[] = []

/** Opens the lobby with `token` and resolves with what comes first: the lobby's first message, or the close. */
const handshake = async (token: string | null): Promise<Outcome> => {
  const query = token === null ? '' : `?token=${token}`
  const request = new Request<unknown, IncomingRequestCfProperties>(`http://gameplay.test/gameplay/lobby${query}`, {
    headers: { Upgrade: 'websocket' },
  })
  const response = await worker.fetch(request, { ...(env as unknown as Env), CAS_ISSUER: issuer })
  const socket = response.webSocket!
  sockets.push(socket)
  const outcome = new Promise<Outcome>(resolve => {
    socket.addEventListener('message', event => resolve({ message: JSON.parse(String(event.data)).type }))
    socket.addEventListener('close', ({ code, reason }) => resolve({ code, reason }))
  })
  socket.accept()
  return outcome
}

describe('the handshake', () => {
  beforeEach(() => {
    issuer = `http://cas-${crypto.randomUUID()}.test`
    cas = 'up'
    casFetch.mockClear()
    vi.stubGlobal('fetch', casFetch)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.close(1000, 'test over')
    }
    await reset()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lets in a token CAS signed for ligretto', async () => {
    expect(await handshake(await tokenOf())).toEqual({ message: updateRoomsAction.type })
  })

  it('closes with 4401 and no code when there is no token, without asking CAS anything', async () => {
    expect(await handshake(null)).toEqual({ code: 4401, reason: '' })
    expect(casFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed', async () => 'not-a-jwt'],
    ['wrong_audience', () => tokenOf({ audience: 'another-service' })],
    ['expired', () => tokenOf({ expiresAt: nowSeconds() - 60 })],
  ])('closes with 4401 and the code of a token refused as %s', async (code, token) => {
    expect(await handshake(await token())).toEqual({ code: 4401, reason: code })
  })

  // Unreadable CAS metadata is not a judgement on the token: the client is told to retry, not to sign in again.
  it('closes with 4503 when CAS answers a failure', async () => {
    const token = await tokenOf()
    cas = 'failing'

    expect(await handshake(token)).toEqual({ code: 4503, reason: 'discovery_unavailable' })
  })

  it('closes with 4503 when CAS does not answer in time', async () => {
    const token = await tokenOf()
    cas = 'stalled'

    expect(await handshake(token)).toEqual({ code: 4503, reason: 'discovery_unavailable' })
  })
})
