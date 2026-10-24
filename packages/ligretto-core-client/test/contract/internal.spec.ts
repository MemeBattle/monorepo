// The generated operations of the `./internal` entry against the real internal app (createInternalApp over PGlite,
// the real games repository) through a custom `fetch`: every operation, every declared status and code once, every
// body checked against the committed openapi.internal.json.
import { createContractHarness, INTERNAL_TOKEN, type ContractHarness } from '@memebattle/ligretto-core/contract-harness'
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

import { createClient, createGame, getHealth, saveRound, type Client, type HealthReport } from '@memebattle/ligretto-core-client/internal'
import { createRecorder, expectEveryPairExercised, readDocument } from '../support/contract'

const BASE_URL = 'http://ligretto-core.test'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const recorder = createRecorder(readDocument('openapi.internal.json'))

let harness: ContractHarness
let internal: Client
let wrongToken: Client

beforeAll(async () => {
  harness = await createContractHarness()
  const client = (token: string) =>
    recorder.wrap(createClient({ baseUrl: BASE_URL, fetch: harness.internalFetch, headers: { authorization: `Bearer ${token}` } }))
  internal = client(INTERNAL_TOKEN)
  wrongToken = client('not-the-token')
})

beforeEach(async () => {
  await harness.reset()
  await harness.seedUsers(['alice', 'bob'].map(sub => ({ sub, accountType: 'full', displayName: sub, avatarUrl: null })))
})

afterAll(async () => {
  // Undefined when beforeAll timed out: its error is the one to report, not a close or a coverage failure.
  if (harness === undefined) {
    return
  }
  await harness.close()
  expectEveryPairExercised(recorder)
})

const newGame = async (): Promise<string> => {
  const result = await createGame({ client: internal })
  if (result.kind !== 'success') {
    throw new Error(`createGame answered ${JSON.stringify(result)}`)
  }
  return result.data.id
}

describe('getHealth', () => {
  it('answers 200 with the report', async () => {
    expect(await getHealth({ client: internal })).toMatchObject({ kind: 'success', status: 200, data: { status: 'ok' } })
  })

  it('answers the whole HealthReport as the error of its 503', async () => {
    harness.database.down()
    const result = await getHealth({ client: internal })
    expect(result).toMatchObject({ kind: 'error', status: 503, error: { status: 'unavailable', checks: { database: { status: 'failed' } } } })
    if (result.kind === 'error' && result.status === 503) {
      expectTypeOf(result.error).toEqualTypeOf<HealthReport>()
    }
  })
})

describe('createGame', () => {
  it('answers 201 with a new id', async () => {
    const result = await createGame({ client: internal })
    expect(result).toMatchObject({ kind: 'success', status: 201 })
    expect(result.kind === 'success' && result.data.id).toMatch(UUID)
  })

  it('answers 401 invalid_internal_token for another token', async () => {
    expect(await createGame({ client: wrongToken })).toMatchObject({ kind: 'error', status: 401, error: { error: 'invalid_internal_token' } })
  })
})

describe('saveRound', () => {
  const round = (results: { playerId: string; score: number }[], roundId: string = crypto.randomUUID()) => ({ roundId, results })

  it("answers 200 with the game's totals for a first round", async () => {
    const id = await newGame()
    const result = await saveRound({ client: internal, path: { id }, body: round([{ playerId: 'alice', score: 10 }]) })
    expect(result).toMatchObject({ kind: 'success', status: 200, data: { gameResults: { alice: { roundScore: 10, gameScore: 10 } } } })
  })

  it('answers 400 validation_failed for empty results', async () => {
    const id = await newGame()
    const result = await saveRound({ client: internal, path: { id }, body: round([]) })
    expect(result).toMatchObject({ kind: 'error', status: 400, error: { error: 'validation_failed' } })
  })

  it("answers 401 invalid_internal_token when the call's header overrides the client's token", async () => {
    const id = await newGame()
    const result = await saveRound({
      client: internal,
      path: { id },
      body: round([{ playerId: 'alice', score: 1 }]),
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(result).toMatchObject({ kind: 'error', status: 401, error: { error: 'invalid_internal_token' } })
  })

  it('answers 404 game_not_found for an unknown game', async () => {
    const result = await saveRound({ client: internal, path: { id: crypto.randomUUID() }, body: round([{ playerId: 'alice', score: 1 }]) })
    expect(result).toMatchObject({ kind: 'error', status: 404, error: { error: 'game_not_found' } })
  })

  it('answers 409 round_conflict for the same round id with other scores', async () => {
    const id = await newGame()
    const roundId = crypto.randomUUID()
    expect(await saveRound({ client: internal, path: { id }, body: round([{ playerId: 'alice', score: 7 }], roundId) })).toMatchObject({
      kind: 'success',
    })
    const result = await saveRound({ client: internal, path: { id }, body: round([{ playerId: 'alice', score: 8 }], roundId) })
    expect(result).toMatchObject({ kind: 'error', status: 409, error: { error: 'round_conflict' } })
  })

  it('answers 422 unknown_players with the ids, typed', async () => {
    const id = await newGame()
    const result = await saveRound({
      client: internal,
      path: { id },
      body: round([
        { playerId: 'alice', score: 1 },
        { playerId: 'carol', score: 2 },
      ]),
    })
    expect(result).toMatchObject({ kind: 'error', status: 422, error: { error: 'unknown_players' } })
    if (result.kind === 'error' && result.status === 422) {
      expectTypeOf(result.error.playerIds).toEqualTypeOf<string[]>()
      expect(result.error.playerIds).toEqual(['carol'])
    }
  })

  it('saves under a path id in upper case', async () => {
    const id = await newGame()
    const result = await saveRound({ client: internal, path: { id: id.toUpperCase() }, body: round([{ playerId: 'bob', score: 3 }]) })
    expect(result).toMatchObject({ kind: 'success', status: 200, data: { gameResults: { bob: { roundScore: 3, gameScore: 3 } } } })
  })
})
