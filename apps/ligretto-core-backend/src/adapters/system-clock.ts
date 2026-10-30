import type { Clock } from '../core/ports/clock.ts'

export const systemClock: Clock = { now: () => Date.now() }
