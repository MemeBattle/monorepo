import { describe, expect, it } from 'vitest'

import {
  ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS,
  CONNECTION_STATE_RECOVERY_TIMEOUT_MS,
  DISCONNECT_GRACE_PERIOD_MS,
  HOST_HANDOVER_TIMEOUT_MS,
} from '../config'

describe('connection lifecycle config', () => {
  it('uses the approved durations and safe timeout ordering', () => {
    expect(DISCONNECT_GRACE_PERIOD_MS).toBe(5_000)
    expect(CONNECTION_STATE_RECOVERY_TIMEOUT_MS).toBe(60_000)
    expect(HOST_HANDOVER_TIMEOUT_MS).toBe(30_000)
    expect(ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS).toBe(120_000)
    expect(HOST_HANDOVER_TIMEOUT_MS).toBeLessThan(ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS)
    expect(ALL_OFFLINE_ROOM_DELETION_TIMEOUT_MS).toBeGreaterThanOrEqual(CONNECTION_STATE_RECOVERY_TIMEOUT_MS)
  })
})
