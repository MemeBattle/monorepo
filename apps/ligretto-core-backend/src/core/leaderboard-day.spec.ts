import { describe, expect, it } from 'vitest'

import { daysBefore, leaderboardDay } from './leaderboard-day.ts'

describe('leaderboardDay', () => {
  it.each([
    ['the last millisecond of a winter day (CET)', Date.UTC(2026, 0, 14, 22, 59, 59, 999), '2026-01-14'],
    ['the first instant of the next winter day', Date.UTC(2026, 0, 14, 23), '2026-01-15'],
    ['the last millisecond of a summer day (CEST)', Date.UTC(2026, 6, 14, 21, 59, 59, 999), '2026-07-14'],
    ['the first instant of the next summer day', Date.UTC(2026, 6, 14, 22), '2026-07-15'],
    ['the day the clocks go forward', Date.UTC(2026, 2, 29, 0, 30), '2026-03-29'],
    ['the start of the day the clocks go back, still CEST', Date.UTC(2026, 9, 24, 22, 30), '2026-10-25'],
    ['the end of the day the clocks go back, CET', Date.UTC(2026, 9, 25, 22, 59), '2026-10-25'],
  ])('answers the Berlin date at %s', (_name, epochMs, day) => {
    expect(leaderboardDay(epochMs)).toBe(day)
  })
})

describe('daysBefore', () => {
  it.each([
    ['2026-11-14', 29, '2026-10-16'],
    ['2026-03-01', 1, '2026-02-28'],
    ['2028-03-01', 1, '2028-02-29'],
    ['2026-01-05', 29, '2025-12-07'],
    ['2026-11-14', 0, '2026-11-14'],
  ])('answers %s minus %i days as %s', (day, n, expected) => {
    expect(daysBefore(day, n)).toBe(expected)
  })
})
