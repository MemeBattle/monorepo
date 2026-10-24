import type { Clock } from '../core/ports/clock'

export const systemClock: Clock = { now: () => Date.now() }
