import { inject, injectable } from 'inversify'
import type { GameResults } from '@memebattle/ligretto-shared'
import { createGame, saveRound, type Client, type SaveRoundRequest } from '@memebattle/ligretto-core-client/internal'
import { IOC_TYPES } from '../../IOC_TYPES'
import { CORE_REQUEST_TIMEOUT_MS, SAVE_ROUND_RETRY_DELAYS_MS } from '../../config'
import { wait } from '../../utils/wait'

export type CreateGameOutcome = { ok: true; gameId: string } | { ok: false }

export type SaveRoundError = 'core_unavailable' | 'game_not_found' | 'unknown_players' | 'round_conflict' | 'validation_failed'

export type SaveRoundOutcome = { ok: true; gameResults: GameResults } | { ok: false; error: SaveRoundError }

type CreateGameResult = Awaited<ReturnType<typeof createGame>>
type SaveRoundResult = Awaited<ReturnType<typeof saveRound>>
type FailedResult = Exclude<CreateGameResult | SaveRoundResult, { kind: 'success' }>

/**
 * Runs one request with a fresh `AbortController` that aborts after `CORE_REQUEST_TIMEOUT_MS`. The transport awaits
 * the headers and the body with the signal attached, so an expiry covers both and resolves as a `transport` result
 * whose `cause` is the abort reason. `setTimeout` rather than `AbortSignal.timeout`, so fake timers drive it in tests.
 */
const withDeadline = async <R>(call: (signal: AbortSignal) => Promise<R>): Promise<R> => {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error(`ligretto-core did not answer within ${CORE_REQUEST_TIMEOUT_MS} ms`)),
    CORE_REQUEST_TIMEOUT_MS,
  )
  try {
    return await call(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The log fields of a failed result. The request id matches the server's own log line; the body of an `unexpected`
 * answer is left out, and the token is never a field.
 */
const failureFields = (result: FailedResult) => {
  switch (result.kind) {
    case 'transport':
      return { kind: result.kind, cause: result.cause instanceof Error ? result.cause.message : String(result.cause) }
    case 'error':
      return {
        kind: result.kind,
        status: result.status,
        error: result.error.error,
        requestId: result.headers.get('x-request-id') ?? undefined,
        ...('playerIds' in result.error ? { playerIds: result.error.playerIds } : {}),
      }
    case 'redirect':
    case 'unexpected':
      return { kind: result.kind, status: result.status, requestId: result.headers.get('x-request-id') ?? undefined }
  }
}

/** A failure worth another attempt with the same body: no answer at all, or a server error the document does not declare. */
const isTransient = (result: Exclude<SaveRoundResult, { kind: 'success' }>) =>
  result.kind === 'transport' || (result.kind === 'unexpected' && result.status >= 500)

/** The outcome of a failed save that is not retried: the declared refusal's code, or `core_unavailable` for the rest. */
const saveRoundError = (result: Exclude<SaveRoundResult, { kind: 'success' }>): SaveRoundError =>
  result.kind === 'error' && result.status !== 401 ? result.error.error : 'core_unavailable'

/**
 * ligretto-core's internal API through the generated client. Neither method throws for an HTTP outcome: each failure is
 * logged with the request id the server returns and reported as an outcome the caller branches on.
 */
@injectable()
export class LigrettoCoreService {
  @inject(IOC_TYPES.LigrettoCoreClient) private client: Client

  /** Creates the game row. Not retried: a lost `201` leaves at most an empty game, and the player can create again. */
  public async createGame(): Promise<CreateGameOutcome> {
    const result = await withDeadline(signal => createGame({ client: this.client, signal }))
    if (result.kind === 'success') {
      return { ok: true, gameId: result.data.id }
    }
    console.error('ligretto-core createGame failed', { operation: 'createGame', ...failureFields(result) })
    return { ok: false }
  }

  /**
   * Saves a finished round. `round` is frozen by the caller, and every attempt sends it unchanged, so a repeat after a
   * lost answer is idempotent on the server. A transport failure or an undeclared 5xx is retried in place after each
   * of `SAVE_ROUND_RETRY_DELAYS_MS`; every other failure is final after one attempt. `401`, a redirect and other
   * undeclared answers are configuration problems (secret, base URL, host) and report `core_unavailable`; `409
   * round_conflict` is a bug, never retried. Every failure ends with one error line that holds the round, the only
   * record of it.
   */
  public async saveRound(gameId: string, round: SaveRoundRequest): Promise<SaveRoundOutcome> {
    const context = { operation: 'saveRound', gameId, roundId: round.roundId }
    const attempts = SAVE_ROUND_RETRY_DELAYS_MS.length + 1

    for (let attempt = 1; ; attempt++) {
      const result = await withDeadline(signal => saveRound({ client: this.client, signal, path: { id: gameId }, body: round }))
      if (result.kind === 'success') {
        return { ok: true, gameResults: result.data.gameResults }
      }

      const fields = { ...context, attempt, ...failureFields(result) }
      if (isTransient(result) && attempt < attempts) {
        console.warn('ligretto-core saveRound failed, retrying', fields)
        await wait(SAVE_ROUND_RETRY_DELAYS_MS[attempt - 1])
        continue
      }

      const error = isTransient(result) ? 'core_unavailable' : saveRoundError(result)
      const message =
        result.kind === 'error' && result.status === 409
          ? 'ligretto-core saveRound gave up: round not recorded (round_conflict is a bug: the round id was sent with other results)'
          : 'ligretto-core saveRound gave up: round not recorded'
      // `outcome` is what the game sees; `error` stays the server's code, so a 401 still reads invalid_internal_token.
      console.error(message, { ...fields, outcome: error, results: round.results })
      return { ok: false, error }
    }
  }
}
