import type { Clock } from './clock.ts'

/** A clock that stands still until the test moves it. */
export const createFixedClock = (start = 0): Clock & { advance(ms: number): void } => {
  let current = start
  return {
    now: () => current,
    advance: ms => {
      current += ms
    },
  }
}
