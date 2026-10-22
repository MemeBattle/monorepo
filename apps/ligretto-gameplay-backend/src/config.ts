import { resolve } from 'node:path'

import dotenv from '@codexsoft/dotenv-flow'

dotenv.config({ default_node_env: 'development', path: resolve(__dirname, '../../..'), silent: true })

export const { LIGRETTO_GAMEPLAY_SOCKET_PORT, CAS_ISSUER = '', LIGRETTO_CORE_URL } = process.env

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
