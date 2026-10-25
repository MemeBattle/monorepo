import { resolve } from 'node:path'

import dotenv from '@codexsoft/dotenv-flow'

// This package's `.env*` files first, then the repository root ones: dotenv-flow never overrides a variable that is
// already set, so the package files win over the root, and the shell wins over both. The package files hold the
// gameplay backend's own `LIGRETTO_CORE_URL`, because the root value belongs to the frontend. The same rule as
// `apps/ligretto-core/src/entry/env.ts`. `..` is the package directory from both `src/` and `build/`.
dotenv.config({ default_node_env: 'development', path: resolve(__dirname, '..'), silent: true })
dotenv.config({ default_node_env: 'development', path: resolve(__dirname, '../../..'), silent: true })

/** `LIGRETTO_CORE_URL` is the base of ligretto-core's internal API: an origin with no `/api`, since its paths start with `/internal`. */
export const { LIGRETTO_GAMEPLAY_SOCKET_PORT, CAS_ISSUER = '', LIGRETTO_CORE_URL } = process.env

/**
 * The shared secret sent to ligretto-core's internal API as `Authorization: Bearer`. The variable takes the server's
 * format, a comma-separated list of one or two values, and the client sends the first one: a rotation adds the new
 * value to the server, switches this value, then removes the old one from the server
 * (`apps/ligretto-core/docs/adrs/internal-api-and-service-authentication.md`).
 */
export const LIGRETTO_INTERNAL_API_TOKEN =
  (process.env.LIGRETTO_INTERNAL_API_TOKEN ?? '')
    .split(',')
    .map(value => value.trim())
    .find(value => value !== '') ?? ''

/**
 * The deadline of one request to ligretto-core, headers and body. A round save makes at most
 * `SAVE_ROUND_RETRY_DELAYS_MS.length + 1` attempts, so its worst case is 3 × 3 s plus the delays, 13 s.
 */
export const CORE_REQUEST_TIMEOUT_MS = 3_000
/** The waits before the second and the third attempt of a round save that failed transiently. */
export const SAVE_ROUND_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000]

// The audience CAS registers for the ligretto client: this app's own name, not a deployment choice.
export const CAS_AUDIENCE = 'ligretto'

export const SOCKET_ROOM_LOBBY = 'SOCKET_ROOM_LOBBY'

export const DISCONNECT_GRACE_PERIOD_MS = 5_000
export const CONNECTION_STATE_RECOVERY_TIMEOUT_MS = 60_000
export const HOST_HANDOVER_TIMEOUT_MS = 30_000
// Invariants: must stay above HOST_HANDOVER_TIMEOUT_MS (an abandoned room hands
// its host over before it can be deleted) and at least
// CONNECTION_STATE_RECOVERY_TIMEOUT_MS (the room must outlive the window where
// Socket.IO can still recover a disconnected session).
export const ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS = 120_000
